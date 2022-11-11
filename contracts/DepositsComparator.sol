//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {PriceConsumerV3} from "./PriceConsumerV3.sol";

/// @title Compare two deposits
/// @author David, Enebeli
/// @notice Deposits are in different currencies so comparing them involves some convertion work
/// @dev Chainlink Pricefeed is used to get the current price of ETH/USD
/// vulnerability: The calculations here are reliable as long as ETH/USD and USDC dp remain 8 and 6 respectively
library DepositsComparator {
    uint256 constant ETH_CURRENCY = 0;
    uint256 constant USDC_CURRENCY = 1;

    ///@dev useful for converting USDC to USD. Although it's pegged but USDC is 6dp.
    uint256 constant USDC_MULTIPLIER = 10**6;

    /// @dev Useful multiplier when converting USD returned from chainlink to wei
    /// chainlink USD is 8 dp, ether is 18 dp
    uint256 constant ETH_USD_MULTIPLIER = 1 ether * 10**8;

    uint256 constant DEPOSIT_MULTIPLIER = 10;
    uint256 constant HIGHEST_DEPOSIT_MULTIPLIER = 15;

    /// @dev Conversions from USDC & ETH to USD are crucial for correct comparism
    /// The 1.5 factor in requirement for new deposits is represented as integer multipliers
    ///      as an alternative to Floating point
    /// @param deposit The new deposit
    /// @param currency The currency of the new deposit
    /// @param highestDeposit The highest deposit amount
    /// @param currencyOfHighestDeposit The currency of the highestDeposit
    /// @return bool True if firstAmount is atleast 1.5 times greater second amount
    function greaterThanOrEquals(
        uint256 deposit,
        uint256 currency,
        uint256 highestDeposit,
        uint256 currencyOfHighestDeposit
    ) internal view returns (bool) {
        uint256 depositMajorUSD;
        uint256 depositMinorUSDNumerator;
        uint256 highestDepositMajorUSD;
        uint256 highestDepositMinorUSDNumerator;

        if (currency == currencyOfHighestDeposit) {
            return
                deposit * DEPOSIT_MULTIPLIER >=
                highestDeposit * HIGHEST_DEPOSIT_MULTIPLIER;
        } else if (currency == ETH_CURRENCY) {
            (depositMajorUSD, depositMinorUSDNumerator) = convertWEIToUSD(
                deposit
            );
            (
                highestDepositMajorUSD,
                highestDepositMinorUSDNumerator
            ) = convertUSDCToUSD(highestDeposit);
        } else {
            (depositMajorUSD, depositMinorUSDNumerator) = convertUSDCToUSD(
                deposit
            );
            (
                highestDepositMajorUSD,
                highestDepositMinorUSDNumerator
            ) = convertWEIToUSD(highestDeposit);
        }
        uint256 scaledDepositMajorUSD = depositMajorUSD * DEPOSIT_MULTIPLIER;
        uint256 scaledHighestDepositMajorUSD = highestDepositMajorUSD *
            HIGHEST_DEPOSIT_MULTIPLIER;
        if (scaledDepositMajorUSD > scaledHighestDepositMajorUSD) return true;
        if (
            scaledDepositMajorUSD == scaledHighestDepositMajorUSD &&
            depositMinorUSDNumerator * DEPOSIT_MULTIPLIER >=
            highestDepositMinorUSDNumerator * HIGHEST_DEPOSIT_MULTIPLIER
        ) return true;
        return false;
    }

    /// @notice Convert Wei to USD
    /// @dev Since division is involved, to avoid loss, result has a major component and minor component.
    /// The major component is the whole number of usd
    /// The minor component is the numerator of the fractional usd scaled so that the effective denominator is USDC_MULTIPLIER X ETH_MULTIPLIER
    /// @param amount wei to convert
    /// @return majorUSD The whole number of usd
    /// @return minorUSDNumerator The scaled numerator of the fractional usd.
    function convertWEIToUSD(uint256 amount)
        private
        view
        returns (uint256 majorUSD, uint256 minorUSDNumerator)
    {

        uint256 usdPerETH = PriceConsumerV3.usdPerETH();
        uint256 majorUSDPerWei = usdPerETH / ETH_USD_MULTIPLIER;

        /// @dev The calculations here can be further optimized
        /// to become majorUSD = 0s 
        /// This is realistic because a greater value can only happen if 1Eth equals more atleast 10**18 USD
        /// That rate is highly unrealistic and may never happen
        /// However for completely we have left out this optimization for now.
        majorUSD = amount * majorUSDPerWei;

        uint256 minorUSDPerWei = usdPerETH % ETH_USD_MULTIPLIER;
        minorUSDNumerator = amount * minorUSDPerWei * USDC_MULTIPLIER;
    }

    /// @notice Convert USDC to USD
    /// @dev Since division is involved, to avoid loss, result has a major component and minor component
    /// The major component is the whole number of usd
    /// The minor component is the numerator of the fractional usd scaled so that the effective denominator is USDC_MULTIPLIER X ETH_MULTIPLIER
    /// @param amount USDC to convert
    /// @return majorUSD The whole number of usd
    /// @return minorUSDNumerator The scaled numerator of the fractional usd.
    function convertUSDCToUSD(uint256 amount)
        private
        pure
        returns (uint256 majorUSD, uint256 minorUSDNumerator)
    {
        majorUSD = amount / USDC_MULTIPLIER;
        unchecked {
            minorUSDNumerator = (amount % USDC_MULTIPLIER) * ETH_USD_MULTIPLIER; // this can never overflow. max possible digits here is 31 but uint is 78
        }
    }
}
