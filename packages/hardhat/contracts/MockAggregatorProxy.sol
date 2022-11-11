//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

///@dev This is for running test locally.

/**
 * Network: Ethereum Goerli
 * Aggregator: ETH/USD
 * Address: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 */
contract MockAggregatorProxy {
  int256 immutable public price;
  constructor(int256 _price) {
    price = _price;
  }
  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ){
      return (0, price , 0, 0, 0);
    }

}
