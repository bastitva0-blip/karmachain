// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {KarmaSBT} from "../src/KarmaSBT.sol";
import {Deployments} from "./Deployments.sol";

/// Env: RELAYER_PRIVATE_KEY (broadcaster, becomes MINTER), ADMIN_ADDRESS (your own wallet, must differ),
///      WEB_ORIGIN (used for token external_url).
contract Deploy is Deployments {
    function run() external {
        uint256 relayerKey = vm.envUint("RELAYER_PRIVATE_KEY");
        address relayer = vm.addr(relayerKey);
        address admin = vm.envAddress("ADMIN_ADDRESS");
        string memory web = vm.envOr("WEB_ORIGIN", string("http://localhost:3000"));
        require(admin != relayer, "ADMIN_ADDRESS must not be the relayer");

        vm.startBroadcast(relayerKey);
        KarmaSBT sbt = new KarmaSBT(admin, relayer, web);
        vm.stopBroadcast();

        D memory d = _read();
        d.sbt = address(sbt);
        d.sbtDeployBlock = block.number;
        _write(d);

        console2.log("KarmaSBT:", address(sbt));
        console2.log("admin:   ", admin);
        console2.log("minter:  ", relayer);
    }
}
