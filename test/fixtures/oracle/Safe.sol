// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe counterparts of Vuln.sol: staleness and answer are validated or handed to the caller.
interface AggregatorV3Interface {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

contract FreshOracle {
    AggregatorV3Interface public feed;
    uint256 public constant HEARTBEAT = 1 hours;

    function price() external view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        require(answer > 0, "bad price");
        require(block.timestamp - updatedAt <= HEARTBEAT, "stale");
        return uint256(answer);
    }

    // validation delegated to a helper
    function priceViaHelper() external view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        _validate(answer, updatedAt);
        return uint256(answer);
    }

    // thin wrapper: hands the raw values to the caller, which must check them
    function rawRound() external view returns (int256 answer, uint256 updatedAt) {
        (, answer, , updatedAt, ) = feed.latestRoundData();
    }

    function _validate(int256 answer, uint256 updatedAt) internal view {
        require(answer > 0 && updatedAt + HEARTBEAT >= block.timestamp, "bad round");
    }
}
