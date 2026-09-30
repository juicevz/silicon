// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SiliconSeries} from "../src/SiliconSeries.sol";

contract MockToken is ERC20 {
    uint8 private immutable places;
    constructor(uint8 d) ERC20("Test", "TST") { places = d; }
    function decimals() public view override returns (uint8) { return places; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev 6-decimal token that skims 1% on transfers, except for the owner.
/// Passes the constructor's code-length and decimals checks.
contract FeeOnTransferToken is ERC20 {
    address public immutable owner;

    constructor() ERC20("Fee", "FEE") { owner = msg.sender; }

    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != owner && from != address(0)) {
            uint256 fee = amount / 100;
            super._update(from, to, amount - fee);
            super._update(from, address(0xd1e), fee);
        } else {
            super._update(from, to, amount);
        }
    }
}

/// @dev Asset that refuses transfers to a toggleable blocked address,
/// modeling a blacklistable stablecoin.
contract BlocklistToken is ERC20 {
    address public blocked;

    constructor() ERC20("Block", "BLK") {}

    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setBlocked(address who) external { blocked = who; }

    function _update(address from, address to, uint256 amount) internal override {
        if (to == blocked && to != address(0)) revert("BLOCKED");
        super._update(from, to, amount);
    }
}

/// @dev Benefits token whose balanceOf reenters the series. nonReentrant must
/// contain it and feeBps's try/catch must swallow the failure.
contract ReentrantBenefitsToken is ERC20 {
    SiliconSeries public series;

    constructor() ERC20("Evil", "EVL") {}

    function decimals() public pure override returns (uint8) { return 18; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setSeries(SiliconSeries s) external { series = s; }
    function balanceOf(address) public view override returns (uint256) {
        // Attempt a reentrant withdraw from inside the fee read. Under the
        // EVM's staticcall rules (and ReentrancyGuard on the write path) this
        // must fail without corrupting the buy in flight.
        (bool ok,) = address(series).staticcall(abi.encodeWithSignature("withdraw(uint256)", 1));
        if (ok) revert("REENTRANCY");
        return 1; // would grant the fee waiver if reads were trusted
    }
}

contract SiliconAuditTest is Test {
    MockToken usd; MockToken token;
    address w1 = makeAddr("w1"); address w2 = makeAddr("w2");
    address b1 = makeAddr("b1"); address b2 = makeAddr("b2");
    uint64 opening; uint64 expiry;
    SiliconSeries series;

    function setUp() public {
        vm.warp(1800000000);
        usd = new MockToken(6); token = new MockToken(18);
        opening = uint64(block.timestamp + 1 hours); expiry = opening + 24 hours;
        series = new SiliconSeries(
            address(usd), address(token), address(this), address(this),
            opening, expiry, 385000000, keccak256("silicon-h100-v1"));
        address[4] memory actors = [w1, w2, b1, b2];
        for (uint256 i = 0; i < actors.length; i++) {
            address a = actors[i];
            usd.mint(a, 2000e6);
            vm.startPrank(a);
            usd.approve(address(series), type(uint256).max);
            token.approve(address(series), type(uint256).max);
            vm.stopPrank();
        }
    }

    function checkInvariants(SiliconSeries s, IERC20 asset) internal view {
        assertGe(asset.balanceOf(address(s)), s.accountedAssets(), "real balance below accounted");
        assertGe(s.accountedAssets(), s.reserved(), "accounted below reserved");
        uint256 outstanding;
        for (uint256 i = 0; i < s.positionCount(); i++) {
            (, bool isCall, bool claimed, uint256 units, uint256 cost, uint256 cap) = s.positions(i);
            if (claimed) continue;
            if (s.cancelled()) outstanding += cost;
            else if (s.settled()) outstanding += s.payout(isCall, units, s.finalIndex());
            else outstanding += (cap > cost ? cap : cost);
        }
        assertGe(s.reserved(), outstanding, "reserved below outstanding entitlements");
    }

    // ------------------------------------------------------------------
    // 1. Full lifecycle, multi-actor, randomized. Proves no value leaks.
    // ------------------------------------------------------------------
    uint256 private randNonce;

    function rnd(uint256 seed, uint256 mod) internal returns (uint256) {
        randNonce++;
        return uint256(keccak256(abi.encode(seed, randNonce))) % mod;
    }

    function testFuzzLifecycleConservation(uint256 seed) public {
        uint256 path = seed % 3; // 0 finalize, 1 dispute, 2 timeout

        address[2] memory writers = [w1, w2];
        for (uint256 i = 0; i < writers.length; i++) {
            uint256 amt = 100e6 + rnd(seed, 400e6);
            vm.prank(writers[i]); series.fund(amt);
        }
        vm.prank(w1); series.withdraw(50e6);
        checkInvariants(series, usd);

        for (uint256 k = 0; k < 4; k++) {
            uint256 t = opening + k * 5 hours + rnd(seed, 5 hours);
            vm.warp(t);
            uint256 cp = 1e6 + rnd(seed, 8e6);
            uint256 pp = 1e6 + rnd(seed, 8e6);
            series.setQuote(100e6, uint64(t), cp, pp, uint64(t + 10 minutes));
            address buyer = k % 2 == 0 ? b1 : b2;
            bool isCall = k % 3 != 0;
            uint256 units = 1000 + rnd(seed, 20e6);
            vm.prank(buyer);
            try series.buy(isCall, units, type(uint256).max, t + 1) {} catch {}
            checkInvariants(series, usd);
        }

        uint256 result = 60e6 + rnd(seed, 80e6);
        if (path == 0) {
            vm.warp(expiry); series.proposeResult(result, expiry, keccak256("r"));
            vm.warp(expiry + 1 hours + 1); series.finalize();
        } else if (path == 1) {
            vm.warp(expiry); series.proposeResult(result, expiry, keccak256("r"));
            series.cancelDisputed(keccak256("disputed"));
        } else {
            vm.warp(expiry + 24 hours); series.cancelTimedOut();
        }
        checkInvariants(series, usd);

        for (uint256 i = 0; i < series.positionCount(); i++) {
            (address buyer,,,,,) = series.positions(i);
            vm.prank(buyer); series.claim(i);
            if (i % 2 == 0) {
                uint256 half = series.shares(w2) / 2;
                vm.prank(w2); series.withdraw(half);
            }
            checkInvariants(series, usd);
        }
        uint256 w1shares = series.shares(w1);
        uint256 w2shares = series.shares(w2);
        vm.prank(w1); series.withdraw(w1shares);
        vm.prank(w2); series.withdraw(w2shares);
        checkInvariants(series, usd);

        assertEq(series.accountedAssets(), 0, "accounted not drained");
        assertEq(series.reserved(), 0, "reserved not drained");
        assertEq(usd.balanceOf(address(series)), 0, "contract keeps funds");
        assertEq(series.totalShares(), 0);

        uint256 held;
        address[4] memory actors = [w1, w2, b1, b2];
        for (uint256 i = 0; i < actors.length; i++) held += usd.balanceOf(actors[i]);
        assertEq(held + usd.balanceOf(address(series)), usd.totalSupply(), "conservation broken");
    }

    // ------------------------------------------------------------------
    // 2. Direct donations are stranded forever (accounting ignores balance).
    // ------------------------------------------------------------------
    function testDonationIsStrandedNotStealable() public {
        vm.prank(w1); series.fund(300e6);
        vm.prank(b1); usd.transfer(address(series), 1e6); // donation
        vm.warp(opening);
        series.setQuote(100e6, opening, 2e6, 2e6, opening + 10 minutes);
        vm.prank(b1); series.buy(true, 1e6, 3e6, opening + 60);
        vm.warp(expiry + 24 hours); series.cancelTimedOut();
        vm.prank(b1); assertEq(series.claim(0), 2020000);
        vm.prank(w1); series.withdraw(300e6);
        // The donated 1e6 can never be reached by any code path.
        assertEq(usd.balanceOf(address(series)), 1e6);
    }

    // ------------------------------------------------------------------
    // 3. Regression: fee-on-transfer asset must be rejected in buy(), which
    //    previously booked the nominal cost and stranded later refunds.
    // ------------------------------------------------------------------
    function testFeeOnTransferAssetRejectedInBuy() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        SiliconSeries s = new SiliconSeries(
            address(fee), address(0), address(this), address(this),
            uint64(block.timestamp + 1 hours), uint64(block.timestamp + 25 hours),
            385000000, keccak256("m"));
        fee.mint(address(this), 1000e6);
        fee.mint(b1, 100e6);
        vm.startPrank(b1); fee.approve(address(s), type(uint256).max); vm.stopPrank();
        fee.approve(address(s), type(uint256).max);
        // Owner transfers carry no fee, so funding books exactly.
        s.fund(300e6);
        assertEq(s.accountedAssets(), fee.balanceOf(address(s)));
        uint64 open = s.openAt();
        vm.warp(open);
        s.setQuote(100e6, open, 2e6, 2e6, open + 10 minutes);
        // The buyer's transferFrom is skimmed 1%; buy must reject the trade
        // instead of booking the full nominal cost.
        vm.prank(b1);
        vm.expectRevert(SiliconSeries.InvalidAmount.selector);
        s.buy(true, 1e6, 3e6, open + 60);
        assertEq(s.positionCount(), 0);
        assertEq(s.accountedAssets(), fee.balanceOf(address(s)), "accounting diverged from balance");
        assertEq(s.reserved(), 0);
    }

    // ------------------------------------------------------------------
    // 4. Regression: a late settlement proposal must leave a usable finalize
    //    window; previously a proposal at expiry+23h-1s had a 1s window.
    // ------------------------------------------------------------------
    function testLateProposalKeepsFinalizeWindow() public {
        vm.prank(w1); series.fund(300e6);
        vm.warp(opening);
        series.setQuote(100e6, opening, 2e6, 2e6, opening + 10 minutes);
        vm.prank(b1); series.buy(true, 1e6, 3e6, opening + 60);
        // One second before the cutoff: accepted, and finalization one hour
        // after the challenge window still succeeds well before the timeout.
        vm.warp(expiry + 22 hours - 1 seconds);
        series.proposeResult(110e6, expiry, keccak256("r"));
        vm.warp(expiry + 23 hours);
        series.finalize();
        assertTrue(series.settled());
        // At the cutoff the proposal is rejected; refund path stays open.
        SiliconSeries s2 = _freshSeries();
        uint64 s2expiry = s2.expiry();
        vm.warp(s2expiry + 22 hours);
        vm.expectRevert(SiliconSeries.WrongPhase.selector);
        s2.proposeResult(110e6, s2expiry, keccak256("r"));
        vm.warp(s2expiry + 24 hours);
        s2.cancelTimedOut();
    }

    function _freshSeries() internal returns (SiliconSeries s) {
        s = new SiliconSeries(
            address(usd), address(0), address(this), address(this),
            uint64(block.timestamp + 1 hours), uint64(block.timestamp + 25 hours),
            385000000, keccak256("m"));
    }

    // ------------------------------------------------------------------
    // 5. Pause gates fund() on the base series; withdrawals stay open.
    // ------------------------------------------------------------------
    function testPauseGatesFundOnBaseSeries() public {
        series.setPaused(true);
        vm.prank(w1);
        vm.expectRevert(SiliconSeries.WrongPhase.selector);
        series.fund(100e6);
        // Writers can still exit pre-open while paused.
        series.setPaused(false);
        vm.prank(w1); series.fund(100e6);
        series.setPaused(true);
        vm.prank(w1); assertEq(series.withdraw(100e6), 100e6);
    }

    // ------------------------------------------------------------------
    // 6. A buyer blocked by the asset can redirect the payout via claimTo().
    // ------------------------------------------------------------------
    function testClaimToEscapesBlocklistedBuyer() public {
        BlocklistToken blk = new BlocklistToken();
        SiliconSeries s = new SiliconSeries(
            address(blk), address(0), address(this), address(this),
            uint64(block.timestamp + 1 hours), uint64(block.timestamp + 25 hours),
            385000000, keccak256("m"));
        blk.mint(w1, 300e6);
        blk.mint(b1, 10e6);
        vm.startPrank(w1); blk.approve(address(s), 300e6); s.fund(300e6); vm.stopPrank();
        vm.startPrank(b1); blk.approve(address(s), type(uint256).max); vm.stopPrank();
        uint64 open = s.openAt();
        vm.warp(open);
        s.setQuote(100e6, open, 2e6, 2e6, open + 10 minutes);
        vm.prank(b1); s.buy(true, 1e6, 3e6, open + 60);
        vm.warp(s.expiry()); s.proposeResult(110e6, s.expiry(), keccak256("r"));
        vm.warp(s.expiry() + 1 hours + 1); s.finalize();
        // The buyer's wallet is now blocked by the asset.
        blk.setBlocked(b1);
        vm.prank(b1);
        vm.expectRevert("BLOCKED");
        s.claim(0);
        // Anyone-but-buyer may not redirect; the buyer may.
        vm.prank(b2);
        vm.expectRevert(SiliconSeries.NotHolder.selector);
        s.claimTo(0, b2);
        vm.prank(b1);
        vm.expectRevert(SiliconSeries.InvalidAmount.selector);
        s.claimTo(0, address(0));
        vm.prank(b1);
        uint256 amount = s.claimTo(0, b2);
        assertEq(amount, 10e6);
        assertEq(blk.balanceOf(b2), 10e6);
        checkInvariants(s, blk);
        // Only holder may redirect; plain claim remains permissionless.
        vm.prank(b1);
        vm.expectRevert(SiliconSeries.WrongPhase.selector);
        s.claim(0);
    }

    // ------------------------------------------------------------------
    // 7. Malicious benefits token reentering during feeBps must be contained.
    // ------------------------------------------------------------------
    function testReentrantBenefitsTokenIsContained() public {
        ReentrantBenefitsToken evil = new ReentrantBenefitsToken();
        SiliconSeries s = new SiliconSeries(
            address(usd), address(evil), address(this), address(this),
            uint64(block.timestamp + 1 hours), uint64(block.timestamp + 25 hours),
            385000000, keccak256("m"));
        evil.setSeries(s);
        vm.startPrank(w1); usd.approve(address(s), type(uint256).max); s.fund(300e6); vm.stopPrank();
        vm.startPrank(b1); usd.approve(address(s), type(uint256).max); vm.stopPrank();
        uint64 open = s.openAt();
        vm.warp(open);
        s.setQuote(100e6, open, 2e6, 2e6, open + 10 minutes);
        // balanceOf reenters withdraw; the guard reverts, the catch swallows
        // it, and the buy still executes at the standard fee with clean state.
        vm.prank(b1);
        s.buy(true, 1e6, type(uint256).max, open + 60);
        assertEq(s.reserved(), 10e6);
        assertEq(s.positionCount(), 1);
        checkInvariants(s, usd);
    }

    // ------------------------------------------------------------------
    // 8. Regression: claiming a nonexistent id reverts cleanly.
    // ------------------------------------------------------------------
    function testClaimBadIdCleanRevert() public {
        vm.prank(w1); series.fund(300e6);
        vm.warp(expiry + 24 hours); series.cancelTimedOut();
        vm.expectRevert(SiliconSeries.InvalidAmount.selector);
        series.claim(999);
        vm.expectRevert(SiliconSeries.InvalidAmount.selector);
        series.claimTo(999, b1);
    }
}
