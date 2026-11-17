// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe counterparts of Vuln.sol: none of these should produce findings.
abstract contract UUPSLike {
    function _authorizeUpgrade(address newImplementation) internal virtual;
}

contract ModifierAuth is UUPSLike {
    address public owner;
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    function _authorizeUpgrade(address) internal override onlyOwner {}
}

contract HelperAuth is UUPSLike {
    address public owner;
    function _authorizeUpgrade(address) internal view override {
        _checkOwner();
    }
    function _checkOwner() internal view {
        require(msg.sender == owner, "not owner");
    }
}

contract SenderAuth is UUPSLike {
    address public upgrader;
    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != upgrader) revert("not upgrader");
    }
}
