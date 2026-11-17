// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal EIP-1967 proxy for the local Anvil fixtures.
contract Proxy {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address implementation, bytes memory data) {
        assembly {
            sstore(IMPLEMENTATION_SLOT, implementation)
        }
        if (data.length > 0) {
            (bool ok, ) = implementation.delegatecall(data);
            require(ok, "init failed");
        }
    }

    fallback() external payable {
        assembly {
            let implementation := sload(IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
