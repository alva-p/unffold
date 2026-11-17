// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Intentionally vulnerable fixture for unffold's security checks.
// Local Anvil only. Never deploy to a public network.
interface AggregatorV3Interface {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function latestAnswer() external view returns (int256);
}

contract StaleOracle {
    AggregatorV3Interface public feed;

    // updatedAt dropped and answer never validated
    function priceDropped() external view returns (uint256) {
        (, int256 price, , , ) = feed.latestRoundData();
        return uint256(price);
    }

    // updatedAt read but never compared with block.timestamp
    function priceIgnored() external view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = feed.latestRoundData();
        require(price > 0, "bad price");
        require(updatedAt > 0, "incomplete round");
        return uint256(price);
    }

    // deprecated API without round metadata
    function legacy() external view returns (int256) {
        return feed.latestAnswer();
    }
}
