// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SiliconSeries} from "../src/SiliconSeries.sol";

contract MockToken is ERC20 {
    uint8 private immutable places;
    constructor(uint8 d) ERC20("Test", "TST") { places = d; }
    function decimals() public view override returns (uint8) { return places; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract SiliconSeriesTest is Test {
    MockToken usd; MockToken token; SiliconSeries series;
    address buyer = address(0xB0B); address writer = address(0xCAFE);
    uint64 opening; uint64 expiry;
    function setUp() public {
        vm.warp(1800000000);
        usd = new MockToken(6); token = new MockToken(18);
        opening = uint64(block.timestamp + 1 hours); expiry = opening + 24 hours;
        series = new SiliconSeries(address(usd), address(token), address(this), address(this), opening, expiry, 385000000, keccak256("silicon-h100-v1"));
        token.mint(writer, 1); token.mint(buyer, 1);
        usd.mint(writer, 300e6); usd.mint(buyer, 1000e6);
        vm.startPrank(writer); usd.approve(address(series), type(uint256).max); series.fund(300e6); vm.stopPrank();
        vm.prank(buyer); usd.approve(address(series), type(uint256).max);
        vm.warp(opening); series.setQuote(100e6, opening, 2e6, 2e6, opening+10 minutes);
    }
    function buy(bool call_, uint256 units) internal returns(uint256 id) {
        vm.prank(buyer); return series.buy(call_, units, type(uint256).max, block.timestamp+60);
    }
    function settle(uint256 result) internal {
        vm.warp(expiry); series.proposeResult(result, expiry, keccak256("receipt"));
        vm.warp(block.timestamp+1 hours); series.finalize();
    }
    function testStrictFeeThreshold() public {
        token.mint(buyer, 5000e18-1); assertEq(series.feeBps(buyer),100);
        uint256 first=buy(true,1e6); (,,,,uint256 cost,)=series.positions(first); assertEq(cost,2020000);
        token.mint(buyer,1); assertEq(series.feeBps(buyer),0);
        uint256 second=buy(true,1e6); (,,,,cost,)=series.positions(second); assertEq(cost,2000000);
    }
    function testCannotTradeWithoutToken() public {
        vm.prank(buyer);token.transfer(writer,1);
        vm.prank(buyer);vm.expectRevert(SiliconSeries.NotHolder.selector);series.buy(true,1e6,3e6,block.timestamp+60);
    }
    function testReserveCannotBeOverissued() public {
        buy(true,30e6);assertEq(series.reserved(),300e6);
        vm.prank(buyer);vm.expectRevert(SiliconSeries.NoCapacity.selector);series.buy(true,7e6,20e6,block.timestamp+60);
        assertLe(series.reserved(),series.accountedAssets());
    }
    function testClaimsRemainOpenWithoutToken() public {
        uint256 id=buy(true,1e6);vm.prank(buyer);token.transfer(writer,1);settle(104e6);
        uint256 beforeBalance=usd.balanceOf(buyer);series.claim(id);assertEq(usd.balanceOf(buyer)-beforeBalance,4e6);
        vm.expectRevert(SiliconSeries.WrongPhase.selector);series.claim(id);
    }
    function testPutAndCap() public {
        uint256 callId=buy(true,1e6);uint256 putId=buy(false,1e6);settle(50e6);
        assertEq(series.claim(callId),0);assertEq(series.claim(putId),10e6);assertEq(series.reserved(),0);
    }
    function testWithdrawCannotStealUnclaimedPayout() public {
        uint256 id=buy(true,1e6);settle(110e6);
        vm.prank(writer);series.withdraw(300e6);
        assertEq(usd.balanceOf(address(series)),10e6);assertEq(series.claim(id),10e6);
        assertEq(usd.balanceOf(address(series)),0);
    }
    function testTimeoutRefundsPremiumAndFee() public {
        uint256 id=buy(true,1e6);vm.warp(expiry+24 hours);series.cancelTimedOut();
        assertEq(series.claim(id),2020000);
        vm.prank(writer);assertEq(series.withdraw(300e6),300e6);
    }
    function testDisputeRefundsAndFinalizationBlocked() public {
        uint256 id=buy(true,1e6);vm.warp(expiry);series.proposeResult(120e6,expiry,keccak256("receipt"));
        series.cancelDisputed(keccak256("wrong basket"));assertEq(series.claim(id),2020000);
        vm.warp(block.timestamp+1 hours);vm.expectRevert(SiliconSeries.WrongPhase.selector);series.finalize();
    }
    function testNoEarlyFinalization() public {
        vm.warp(expiry);series.proposeResult(104e6,expiry,keccak256("receipt"));
        vm.expectRevert(SiliconSeries.WrongPhase.selector);series.finalize();
    }
    function testStaleQuoteBlocksNewTrade() public {
        vm.warp(opening+11 minutes);vm.prank(buyer);vm.expectRevert(SiliconSeries.StaleQuote.selector);series.buy(true,1e6,3e6,block.timestamp+60);
    }
    function testSlippageGuard() public {
        vm.prank(buyer);vm.expectRevert(SiliconSeries.PriceMoved.selector);series.buy(true,1e6,2e6,block.timestamp+60);
    }
    function testWriterCannotExitDuringOpenSeries() public {
        vm.prank(writer);vm.expectRevert(SiliconSeries.WrongPhase.selector);series.withdraw(1e6);
        vm.prank(writer);vm.expectRevert(SiliconSeries.WrongPhase.selector);series.fund(1e6);
    }
    function testOnlyPublisherCanPublish() public {
        vm.prank(buyer);vm.expectRevert(SiliconSeries.NotAuthorized.selector);series.setQuote(100e6,opening,2e6,2e6,opening+60);
    }
    function testFuzzPayoutNeverExceedsCap(uint64 units, uint32 index_) public view {
        uint256 cap=uint256(units)*10;
        assertLe(series.payout(true,units,index_),cap);
        assertLe(series.payout(false,units,index_),cap);
    }
    function testFuzzConservation(uint32 rawUnits, uint32 rawIndex) public {
        uint256 units=bound(rawUnits,1000,29e6);uint256 index_=bound(rawIndex,1,200e6);
        uint256 id=buy(true,units);settle(index_);
        vm.prank(writer);uint256 returned=series.withdraw(300e6);
        uint256 paid=series.claim(id);
        (,,,,uint256 cost,)=series.positions(id);
        assertEq(returned+paid,300e6+cost);
        assertEq(usd.balanceOf(address(series)),0);
    }
}
