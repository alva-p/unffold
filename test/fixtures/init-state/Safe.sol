// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "./Initializable.sol";

// Safe counterpart: initializers are disabled on the implementation, and the test
// initializes the proxy atomically in its constructor.
contract SafeVaultImpl is Initializable {
    address public owner;

    constructor() {
        _disableInitializers();
    }

    function initialize(address newOwner) external initializer {
        owner = newOwner;
    }
}
