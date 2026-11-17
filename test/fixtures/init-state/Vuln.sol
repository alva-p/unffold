// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "./Initializable.sol";

// Intentionally vulnerable fixture for unffold's security checks.
// Local Anvil only. Never deploy to a public network.
// The constructor does not call _disableInitializers(), so the implementation itself
// can be initialized by anyone; the test also deploys the proxy without initializing it.
contract VaultImpl is Initializable {
    address public owner;

    function initialize(address newOwner) external initializer {
        owner = newOwner;
    }
}
