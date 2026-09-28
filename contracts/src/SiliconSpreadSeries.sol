// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SiliconSeries} from "./SiliconSeries.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Capped exposure to B200 percentage return minus H100 percentage return.
/// @dev Both receipt-backed prices are still published by a trusted operator.
/// A fixed B200 benchmark must be established before deploying this instrument.
contract SiliconSpreadSeries is SiliconSeries {
    uint256 public immutable baseB200Price;
    uint256 public constant MAX_PAIR_SKEW = 15 minutes;
    event ReferencePair(uint256 h100Price, uint256 b200Price, uint64 h100Time, uint64 b200Time, bytes32 h100Receipt, bytes32 b200Receipt, bool settlement);

    struct Reference {
        uint128 price;
        uint64 observedAt;
        bytes32 receipt;
    }

    constructor(address asset_, address token_, address publisher_, address guardian_, uint64 openAt_, uint64 expiry_, uint256 baseH100_, uint256 baseB200_)
        SiliconSeries(asset_, token_, publisher_, guardian_, openAt_, expiry_, baseH100_, keccak256("silicon-b200-h100-spread-v1"))
    {
        if (baseB200_ == 0 || baseB200_ > type(uint128).max || baseH100_ > type(uint128).max) revert InvalidTerms();
        baseB200Price = baseB200_;
    }

    // A caller cannot bypass paired-reference validation through the base ABI.
    function setQuote(uint256, uint64, uint256, uint256, uint64) external pure override { revert InvalidTerms(); }
    function proposeResult(uint256, uint64, bytes32) external pure override { revert InvalidTerms(); }

    function spreadIndex(uint128 h100Price, uint128 b200Price) public view returns (uint256) {
        if (h100Price == 0 || b200Price == 0) revert InvalidTerms();
        int256 difference = int256(Math.mulDiv(b200Price, STRIKE, baseB200Price)) - int256(Math.mulDiv(h100Price, STRIKE, baseRentalPrice));
        // Outside these bounds the inherited 10 USDG payout is already capped.
        if (difference >= 10e6) return STRIKE + 10e6;
        if (difference <= -10e6) return STRIKE - 10e6;
        return uint256(int256(STRIKE) + difference);
    }

    function _pair(Reference calldata h100, Reference calldata b200, bool settlement) private returns (uint256 index, uint64 observed) {
        if (h100.receipt == bytes32(0) || b200.receipt == bytes32(0) || h100.observedAt > block.timestamp || b200.observedAt > block.timestamp) revert InvalidTerms();
        uint64 older = h100.observedAt < b200.observedAt ? h100.observedAt : b200.observedAt;
        uint64 newer = h100.observedAt > b200.observedAt ? h100.observedAt : b200.observedAt;
        if (newer - older > MAX_PAIR_SKEW || (!settlement && block.timestamp - older > SOURCE_FRESHNESS)
            || (settlement && (older < expiry || newer > expiry + SOURCE_FRESHNESS))) revert InvalidTerms();
        emit ReferencePair(h100.price, b200.price, h100.observedAt, b200.observedAt, h100.receipt, b200.receipt, settlement);
        return (spreadIndex(h100.price, b200.price), older);
    }

    function setSpreadQuote(Reference calldata h100, Reference calldata b200, uint256 callPremium_, uint256 putPremium_, uint64 validUntil) external {
        (uint256 index, uint64 observed) = _pair(h100, b200, false);
        _setQuote(index, observed, callPremium_, putPremium_, validUntil);
    }

    function proposeSpreadResult(Reference calldata h100, Reference calldata b200) external {
        (uint256 index, uint64 observed) = _pair(h100, b200, true);
        _proposeResult(index, observed, keccak256(abi.encode(h100, b200)));
    }
}
