// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Intentionally vulnerable fixture for unffold's security checks.
// Local Anvil only. Never deploy to a public network.

// Minimal stand-in for OZ UUPSUpgradeable so the fixture compiles without dependencies.
abstract contract UUPSLike {
    function _authorizeUpgrade(address newImplementation) internal virtual;
}

// Anyone can upgrade: empty body, no modifier.
contract EmptyAuth is UUPSLike {
    function _authorizeUpgrade(address) internal override {}
}

// Validates the input but never checks the caller.
contract InputOnlyAuth is UUPSLike {
    function _authorizeUpgrade(address newImplementation) internal view override {
        require(newImplementation.code.length > 0, "not a contract");
    }
}
