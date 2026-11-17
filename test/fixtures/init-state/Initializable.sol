// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal stand-in for OZ v5 Initializable: same ERC-7201 slot and packing
// (uint64 _initialized, bool _initializing), so on-chain reads match real deployments.
abstract contract Initializable {
    struct InitializableStorage {
        uint64 _initialized;
        bool _initializing;
    }

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.Initializable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant INITIALIZABLE_STORAGE = 0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00;

    function _initStorage() private pure returns (InitializableStorage storage $) {
        assembly {
            $.slot := INITIALIZABLE_STORAGE
        }
    }

    modifier initializer() {
        InitializableStorage storage $ = _initStorage();
        require($._initialized == 0, "already initialized");
        $._initialized = 1;
        _;
    }

    function _disableInitializers() internal {
        _initStorage()._initialized = type(uint64).max;
    }
}
