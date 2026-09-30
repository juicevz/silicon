// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice An isolated, fully collateralized GPU rental-price option series.
/// @dev Source receipts are published by a trusted operator. No oracle claim is
/// made about decentralized validation. This source requires review before use.
contract SiliconSeries is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant UNIT = 1e6;
    uint256 public constant STRIKE = 100e6;
    uint256 public constant MAX_PAYOUT = 10e6;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant CHALLENGE_WINDOW = 1 hours;
    uint256 public constant SETTLEMENT_TIMEOUT = 24 hours;
    uint256 public constant SOURCE_FRESHNESS = 3 hours;
    uint256 public constant ACCESS_POLICY = 2; // Open trading; optional holder fee waiver.

    IERC20 public immutable asset;
    IERC20 public immutable token;
    address public immutable publisher;
    address public immutable guardian;
    uint256 public immutable feeFreeThreshold;
    uint64 public immutable openAt;
    uint64 public immutable expiry;
    uint256 public immutable baseRentalPrice; // USD / GPU-hour, 1e8 precision.
    bytes32 public immutable methodology;

    uint256 public accountedAssets;
    uint256 public reserved;
    uint256 public totalShares;
    uint256 public totalCallUnits;
    uint256 public totalPutUnits;
    uint256 public totalCosts;
    uint256 public unclaimedCount;
    uint256 public callPremium;
    uint256 public putPremium;
    uint256 public currentIndex;
    uint64 public observationTime;
    uint64 public quoteValidUntil;
    uint64 public proposedAt;
    uint256 public finalIndex;
    bytes32 public resultReceipt;
    bool public settled;
    bool public cancelled;
    bool public paused;

    struct Position {
        address buyer;
        bool isCall;
        bool claimed;
        uint256 units;
        uint256 cost;
        uint256 cap;
    }
    Position[] public positions;
    mapping(address => uint256) public shares;

    event Funded(address indexed writer, uint256 amount);
    event Withdrawn(address indexed writer, uint256 amount, uint256 sharesBurned);
    event Bought(uint256 indexed id, address indexed buyer, bool isCall, uint256 units, uint256 premium, uint256 fee, uint256 cap);
    event QuoteUpdated(uint256 index, uint64 observedAt, uint256 callPremium, uint256 putPremium, uint64 validUntil);
    event ResultProposed(uint256 index, uint64 observedAt, bytes32 receipt);
    event Finalized(uint256 index, uint256 liability);
    event Cancelled(bytes32 reason);
    event Claimed(uint256 indexed id, address indexed recipient, uint256 amount);
    event Paused(bool value);

    error InvalidTerms();
    error NotHolder();
    error NotAuthorized();
    error WrongPhase();
    error NoCapacity();
    error StaleQuote();
    error PriceMoved();
    error InvalidAmount();

    constructor(address asset_, address token_, address publisher_, address guardian_, uint64 openAt_, uint64 expiry_, uint256 basePrice_, bytes32 methodology_) {
        if (asset_.code.length == 0 || (token_ != address(0) && token_.code.length == 0) || publisher_ == address(0) || guardian_ == address(0)
            || openAt_ <= block.timestamp || expiry_ < openAt_ + 1 hours || expiry_ > openAt_ + 30 days
            || basePrice_ == 0 || methodology_ == bytes32(0) || IERC20Metadata(asset_).decimals() != 6) revert InvalidTerms();
        uint256 decimals = token_ == address(0) ? 0 : IERC20Metadata(token_).decimals();
        if (decimals > 24) revert InvalidTerms();
        asset = IERC20(asset_); token = IERC20(token_);
        publisher = publisher_; guardian = guardian_;
        feeFreeThreshold = token_ == address(0) ? 0 : 5000 * 10 ** decimals;
        openAt = openAt_; expiry = expiry_; baseRentalPrice = basePrice_; methodology = methodology_;
    }

    function feeBps(address wallet) public view returns (uint256) {
        if (address(token) == address(0)) return FEE_BPS;
        // An optional benefits token cannot block the market. A changed fee is
        // still bounded by the buyer's signed maxTotal in buy().
        try token.balanceOf(wallet) returns (uint256 balance) {
            return balance > feeFreeThreshold ? 0 : FEE_BPS;
        } catch {
            return FEE_BPS;
        }
    }

    function fund(uint256 amount) external virtual nonReentrant {
        _fund(amount);
    }

    function _fund(uint256 amount) internal {
        if (paused) revert WrongPhase();
        if (block.timestamp >= openAt || cancelled || settled) revert WrongPhase();
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert InvalidAmount();
        accountedAssets += amount; totalShares += amount; shares[msg.sender] += amount;
        emit Funded(msg.sender, amount);
    }

    /// @notice New deposits close before any option may be bought. All premium
    /// and fee revenue stays in this series for its writers and payout capacity.
    function withdraw(uint256 shareAmount) external nonReentrant returns (uint256 amount) {
        if (block.timestamp >= openAt && !settled && !cancelled) revert WrongPhase();
        if (shareAmount == 0 || shareAmount > shares[msg.sender]) revert InvalidAmount();
        amount = Math.mulDiv(accountedAssets - reserved, shareAmount, totalShares);
        shares[msg.sender] -= shareAmount; totalShares -= shareAmount;
        accountedAssets -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, shareAmount);
    }

    function setQuote(uint256 index_, uint64 observedAt, uint256 callPremium_, uint256 putPremium_, uint64 validUntil) external virtual {
        _setQuote(index_, observedAt, callPremium_, putPremium_, validUntil);
    }

    function _setQuote(uint256 index_, uint64 observedAt, uint256 callPremium_, uint256 putPremium_, uint64 validUntil) internal {
        if (msg.sender != publisher) revert NotAuthorized();
        if (settled || cancelled || block.timestamp >= expiry - 5 minutes) revert WrongPhase();
        if (observedAt > block.timestamp || block.timestamp - observedAt > SOURCE_FRESHNESS || observedAt < observationTime
            || validUntil <= block.timestamp || validUntil > block.timestamp + 15 minutes || index_ == 0 || index_ > 1000e6
            || callPremium_ == 0 || putPremium_ == 0 || callPremium_ >= MAX_PAYOUT || putPremium_ >= MAX_PAYOUT) revert InvalidTerms();
        currentIndex = index_; observationTime = observedAt; quoteValidUntil = validUntil;
        callPremium = callPremium_; putPremium = putPremium_;
        emit QuoteUpdated(index_, observedAt, callPremium_, putPremium_, validUntil);
    }

    function quote(address buyer, bool isCall, uint256 units) public view returns (uint256 premium, uint256 fee, uint256 cap) {
        premium = Math.mulDiv(units, isCall ? callPremium : putPremium, UNIT);
        fee = Math.mulDiv(premium, feeBps(buyer), 10000);
        cap = Math.mulDiv(units, MAX_PAYOUT, UNIT);
    }

    function buy(bool isCall, uint256 units, uint256 maxTotal, uint256 deadline) external nonReentrant returns (uint256 id) {
        if (paused || cancelled || settled || block.timestamp < openAt || block.timestamp >= expiry - 5 minutes) revert WrongPhase();
        if (block.timestamp > deadline || block.timestamp > quoteValidUntil || observationTime == 0 || block.timestamp - observationTime > SOURCE_FRESHNESS) revert StaleQuote();
        if (units < 1000 || units > 1e12) revert InvalidAmount();
        (uint256 premium, uint256 fee, uint256 cap) = quote(msg.sender, isCall, units);
        uint256 cost = premium + fee;
        if (cost > maxTotal || premium == 0) revert PriceMoved();
        uint256 liability = Math.max(cap, cost);
        // Deliberately require collateral before collecting this trade's cost.
        if (accountedAssets - reserved < liability) revert NoCapacity();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), cost);
        // Reject deflating or fee-taking assets so accounting never exceeds
        // the real balance; mirrors the receipt check in _fund().
        if (asset.balanceOf(address(this)) - beforeBalance != cost) revert InvalidAmount();
        accountedAssets += cost; reserved += liability; totalCosts += cost;
        if (isCall) totalCallUnits += units; else totalPutUnits += units;
        id = positions.length;
        positions.push(Position(msg.sender, isCall, false, units, cost, cap));
        unclaimedCount++;
        emit Bought(id, msg.sender, isCall, units, premium, fee, cap);
    }

    function proposeResult(uint256 index_, uint64 observedAt, bytes32 receipt) external virtual {
        _proposeResult(index_, observedAt, receipt);
    }

    function _proposeResult(uint256 index_, uint64 observedAt, bytes32 receipt) internal {
        if (msg.sender != publisher) revert NotAuthorized();
        // Proposals must leave a full challenge window plus at least one more
        // hour to finalize before the settlement timeout force-cancels.
        if (block.timestamp < expiry || block.timestamp >= expiry + SETTLEMENT_TIMEOUT - 2 * CHALLENGE_WINDOW || settled || cancelled || proposedAt != 0) revert WrongPhase();
        if (observedAt < expiry || observedAt > expiry + SOURCE_FRESHNESS || observedAt > block.timestamp || index_ == 0 || index_ > 1000e6 || receipt == bytes32(0)) revert InvalidTerms();
        finalIndex = index_; resultReceipt = receipt; proposedAt = uint64(block.timestamp);
        emit ResultProposed(index_, observedAt, receipt);
    }

    function finalize() external {
        if (settled || cancelled || proposedAt == 0 || block.timestamp < proposedAt + CHALLENGE_WINDOW || block.timestamp >= expiry + SETTLEMENT_TIMEOUT) revert WrongPhase();
        settled = true;
        reserved = payout(true, totalCallUnits, finalIndex) + payout(false, totalPutUnits, finalIndex);
        emit Finalized(finalIndex, reserved);
    }

    function cancelDisputed(bytes32 reason) external {
        if (msg.sender != guardian) revert NotAuthorized();
        if (settled || cancelled || proposedAt == 0 || block.timestamp >= proposedAt + CHALLENGE_WINDOW || reason == bytes32(0)) revert WrongPhase();
        _cancel(reason);
    }

    function cancelTimedOut() external {
        if (settled || cancelled || block.timestamp < expiry + SETTLEMENT_TIMEOUT) revert WrongPhase();
        _cancel(keccak256("SETTLEMENT_TIMEOUT"));
    }

    function _cancel(bytes32 reason) private {
        cancelled = true; reserved = totalCosts;
        emit Cancelled(reason);
    }

    function setPaused(bool value) external {
        if (msg.sender != guardian) revert NotAuthorized();
        paused = value; emit Paused(value);
    }

    function payout(bool isCall, uint256 units, uint256 index_) public pure returns (uint256) {
        uint256 points = isCall ? (index_ > STRIKE ? index_ - STRIKE : 0) : (index_ < STRIKE ? STRIKE - index_ : 0);
        return Math.mulDiv(units, Math.min(points, 10e6), UNIT);
    }

    function claim(uint256 id) external nonReentrant returns (uint256 amount) {
        if (id >= positions.length) revert InvalidAmount();
        amount = _claim(id, positions[id].buyer);
    }

    /// @notice Lets a buyer redirect a payout when their own wallet cannot
    /// receive the asset (for example an asset-level blocklist).
    function claimTo(uint256 id, address recipient) external nonReentrant returns (uint256 amount) {
        if (id >= positions.length) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidAmount();
        if (msg.sender != positions[id].buyer) revert NotHolder();
        amount = _claim(id, recipient);
    }

    function _claim(uint256 id, address recipient) private returns (uint256 amount) {
        if (!settled && !cancelled) revert WrongPhase();
        Position storage position = positions[id];
        if (position.claimed) revert WrongPhase();
        amount = cancelled ? position.cost : payout(position.isCall, position.units, finalIndex);
        position.claimed = true;
        unclaimedCount--; reserved -= amount; accountedAssets -= amount;
        if (unclaimedCount == 0) reserved = 0; // Release aggregate rounding dust.
        if (amount != 0) asset.safeTransfer(recipient, amount);
        emit Claimed(id, recipient, amount);
    }

    function positionCount() external view returns (uint256) { return positions.length; }

    /// @notice Unreserved accounted assets. Assets sent directly to this
    /// contract are not withdrawable by design; accounting is share-based to
    /// block balance-inflation manipulation.
    function available() external view returns (uint256) { return accountedAssets - reserved; }
}
