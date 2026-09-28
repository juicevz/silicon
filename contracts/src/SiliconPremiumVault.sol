// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SiliconSeries} from "./SiliconSeries.sol";

/// @notice One opt-in premium vault round. Shares never roll into another round.
/// @dev The inherited accounting reserves all buyer payouts before redemptions.
contract SiliconPremiumVaultRound is SiliconSeries {
    uint256 public immutable depositLimit;

    constructor(address asset_, address token_, address publisher_, address guardian_, uint64 openAt_, uint64 expiry_, uint256 basePrice_, uint256 limit_)
        SiliconSeries(asset_, token_, publisher_, guardian_, openAt_, expiry_, basePrice_, keccak256("silicon-h100-v1"))
    {
        if (limit_ == 0) revert InvalidTerms();
        depositLimit = limit_;
    }

    function fund(uint256 amount) external override nonReentrant {
        if (paused) revert WrongPhase();
        if (amount > depositLimit || accountedAssets > depositLimit - amount) revert NoCapacity();
        _fund(amount);
    }
}

/// @notice Repeated, isolated H100 rounds with a fixed maximum collateral budget.
/// @dev The operator may schedule rounds but cannot withdraw depositors' shares.
contract SiliconPremiumVaultFactory {
    address public immutable asset;
    address public immutable token;
    address public immutable publisher;
    address public immutable guardian;
    uint256 public immutable maxRoundDeposits;
    address[] public rounds;

    event RoundCreated(uint256 indexed number, address indexed round, uint64 opens, uint64 expires, uint256 depositLimit);
    error InvalidRound();

    constructor(address asset_, address token_, address publisher_, address guardian_, uint256 maxRoundDeposits_) {
        if (asset_.code.length == 0 || token_.code.length == 0 || publisher_ == address(0) || guardian_ == address(0) || maxRoundDeposits_ == 0) revert InvalidRound();
        asset = asset_; token = token_; publisher = publisher_; guardian = guardian_; maxRoundDeposits = maxRoundDeposits_;
    }

    function createRound(uint64 opens, uint8 days_, uint256 basePrice, uint256 limit) external returns (address round) {
        if (msg.sender != publisher || opens < block.timestamp + 1 days || (days_ != 7 && days_ != 14 && days_ != 30) || limit == 0 || limit > maxRoundDeposits) revert InvalidRound();
        // Leave a full settlement-timeout window and one day to redeem between rounds.
        if (rounds.length > 0 && opens < SiliconSeries(rounds[rounds.length - 1]).expiry() + 2 days) revert InvalidRound();
        uint64 expires = opens + uint64(days_) * 1 days;
        round = address(new SiliconPremiumVaultRound(asset, token, publisher, guardian, opens, expires, basePrice, limit));
        rounds.push(round);
        emit RoundCreated(rounds.length, round, opens, expires, limit);
    }

    function roundCount() external view returns (uint256) { return rounds.length; }
}
