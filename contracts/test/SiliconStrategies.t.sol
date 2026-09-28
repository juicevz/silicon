// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {MockToken} from "./SiliconSeries.t.sol";
import {SiliconSeries} from "../src/SiliconSeries.sol";
import {SiliconPremiumVaultFactory, SiliconPremiumVaultRound} from "../src/SiliconPremiumVault.sol";
import {SiliconSpreadSeries} from "../src/SiliconSpreadSeries.sol";

contract SiliconStrategiesTest is Test {
    MockToken usd; MockToken token;
    address writer = address(0xCAFE); address buyer = address(0xB0B);
    uint64 opens; uint64 expires;
    SiliconSpreadSeries spread;
    SiliconPremiumVaultFactory factory;

    function setUp() public {
        vm.warp(1800000000);
        usd = new MockToken(6); token = new MockToken(18);
        token.mint(writer, 1); token.mint(buyer, 1);
        usd.mint(writer, 1000e6); usd.mint(buyer, 1000e6);
        opens = uint64(block.timestamp + 1 days); expires = opens + 7 days;
        factory = new SiliconPremiumVaultFactory(address(usd), address(token), address(this), address(this), 300e6);
        spread = new SiliconSpreadSeries(address(usd), address(token), address(this), address(this), opens, expires, 400000000, 800000000);
    }

    function ref(uint128 price, uint64 at) internal pure returns (SiliconSpreadSeries.Reference memory) {
        return SiliconSpreadSeries.Reference(price, at, keccak256(abi.encode(price, at)));
    }

    function testRoundLimitPauseAndManualRollover() public {
        SiliconPremiumVaultRound round = SiliconPremiumVaultRound(factory.createRound(opens, 7, 400000000, 300e6));
        vm.startPrank(writer); usd.approve(address(round), 1000e6);
        vm.expectRevert(SiliconSeries.NoCapacity.selector); round.fund(301e6);
        round.fund(300e6); vm.stopPrank();
        round.setPaused(true);
        vm.prank(writer); vm.expectRevert(SiliconSeries.WrongPhase.selector); round.fund(1);
        vm.prank(writer); assertEq(round.withdraw(50e6), 50e6);
        vm.expectRevert(SiliconPremiumVaultFactory.InvalidRound.selector); factory.createRound(expires, 7, 400000000, 300e6);
        address next = factory.createRound(expires + 2 days, 14, 400000000, 300e6);
        assertEq(SiliconSeries(next).shares(writer), 0);
        vm.warp(expires + 24 hours); round.cancelTimedOut();
        vm.prank(writer); assertEq(round.withdraw(250e6), 250e6);
        assertEq(factory.roundCount(), 2);
    }

    function testVaultReservesPayoutBeforeRedeemingAndCanLosePrincipal() public {
        SiliconPremiumVaultRound round = SiliconPremiumVaultRound(factory.createRound(opens, 7, 400000000, 300e6));
        vm.startPrank(writer); usd.approve(address(round), 300e6); round.fund(300e6); vm.stopPrank();
        vm.warp(opens); round.setQuote(100e6, opens, 2e6, 2e6, opens + 10 minutes);
        vm.startPrank(buyer); usd.approve(address(round), 100e6); round.buy(true, 1e6, 3e6, opens + 60); vm.stopPrank();
        vm.warp(expires); round.proposeResult(110e6, expires, keccak256("receipt"));
        vm.warp(expires + 1 hours); round.finalize();
        vm.prank(writer); assertEq(round.withdraw(300e6), 292020000);
        assertEq(round.claim(0), 10e6);
    }

    function testSpreadRelativeReturnsNotPriceRatio() public view {
        assertEq(spread.spreadIndex(400000000, 840000000), 105e6);
        assertEq(spread.spreadIndex(420000000, 840000000), 100e6);
        assertEq(spread.spreadIndex(420000000, 800000000), 95e6);
        assertEq(spread.spreadIndex(400000000, 1600000000), 110e6);
    }

    function testSpreadPairedSettlementAndWriterConservation() public {
        vm.startPrank(writer); usd.approve(address(spread), 300e6); spread.fund(300e6); vm.stopPrank();
        vm.warp(opens);
        spread.setSpreadQuote(ref(400000000, opens), ref(800000000, opens), 2e6, 2e6, opens + 600);
        vm.startPrank(buyer); usd.approve(address(spread), 100e6); spread.buy(true, 1e6, 3e6, opens + 60); vm.stopPrank();
        vm.warp(expires);
        spread.proposeSpreadResult(ref(400000000, expires), ref(840000000, expires));
        vm.warp(expires + 1 hours); spread.finalize();
        vm.prank(writer); uint256 returned = spread.withdraw(300e6);
        assertEq(spread.claim(0), 5e6); assertEq(returned + 5e6, 302020000);
    }

    function testCannotBypassPairedReferencesOrPublishStaleLeg() public {
        vm.expectRevert(SiliconSeries.InvalidTerms.selector); spread.setQuote(105e6, opens, 2e6, 2e6, opens + 600);
        vm.expectRevert(SiliconSeries.InvalidTerms.selector); spread.proposeResult(105e6, expires, keccak256("single"));
        vm.warp(opens);
        vm.expectRevert(SiliconSeries.InvalidTerms.selector); spread.setSpreadQuote(ref(400000000, opens - 901), ref(800000000, opens), 2e6, 2e6, opens + 600);
        vm.prank(buyer); vm.expectRevert(SiliconSeries.NotAuthorized.selector); spread.setSpreadQuote(ref(400000000, opens), ref(800000000, opens), 2e6, 2e6, opens + 600);
        vm.warp(expires + 3 hours + 1);
        vm.expectRevert(SiliconSeries.InvalidTerms.selector); spread.proposeSpreadResult(ref(400000000, expires + 3 hours), ref(800000000, expires + 3 hours + 1));
    }

    function testFuzzSpreadAlwaysCapped(uint128 h100, uint128 b200) public view {
        h100 = uint128(bound(h100, 1, type(uint128).max)); b200 = uint128(bound(b200, 1, type(uint128).max));
        uint256 index = spread.spreadIndex(h100, b200);
        assertGe(index, 90e6); assertLe(index, 110e6);
    }
}
