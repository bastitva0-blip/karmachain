// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

/// @notice Reads and rewrites packages/shared/deployments.json (flat keys, single source for web + api).
abstract contract Deployments is Script {
    string internal constant PATH = "../shared/deployments.json";

    struct D {
        address eas;
        address schemaRegistry;
        address sbt;
        uint256 sbtDeployBlock;
        bytes32 schemaClientReview;
        bytes32 schemaInterviewResult;
    }

    function _read() internal view returns (D memory d) {
        string memory json = vm.readFile(PATH);
        d.eas = vm.parseJsonAddress(json, ".eas");
        d.schemaRegistry = vm.parseJsonAddress(json, ".schemaRegistry");
        d.sbt = vm.parseJsonAddress(json, ".sbt");
        d.sbtDeployBlock = vm.parseJsonUint(json, ".sbtDeployBlock");
        d.schemaClientReview = vm.parseJsonBytes32(json, ".schemaClientReview");
        d.schemaInterviewResult = vm.parseJsonBytes32(json, ".schemaInterviewResult");
    }

    function _write(D memory d) internal {
        string memory k = "deployments";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "eas", d.eas);
        vm.serializeAddress(k, "schemaRegistry", d.schemaRegistry);
        vm.serializeAddress(k, "sbt", d.sbt);
        vm.serializeUint(k, "sbtDeployBlock", d.sbtDeployBlock);
        vm.serializeBytes32(k, "schemaClientReview", d.schemaClientReview);
        string memory out = vm.serializeBytes32(k, "schemaInterviewResult", d.schemaInterviewResult);
        vm.writeJson(out, PATH);
    }
}
