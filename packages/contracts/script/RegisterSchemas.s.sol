// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {Deployments} from "./Deployments.sol";

/// Minimal slice of EAS SchemaRegistry v1.2.0 (Base Sepolia predeploy 0x4200...0020).
interface ISchemaRegistry {
    struct SchemaRecord {
        bytes32 uid;
        address resolver;
        bool revocable;
        string schema;
    }

    function register(string calldata schema, address resolver, bool revocable) external returns (bytes32);
    function getSchema(bytes32 uid) external view returns (SchemaRecord memory);
}

/// Idempotent: skips schemas that already exist (UID is deterministic).
contract RegisterSchemas is Deployments {
    string internal constant CLIENT_REVIEW =
        "address developer,uint8 rating,string skillTag,string summary,bytes32 transcriptHash";
    string internal constant INTERVIEW_RESULT = "address candidate,bytes32 reportHash,uint8 overall,string role";

    function run() external {
        uint256 key = vm.envUint("RELAYER_PRIVATE_KEY");
        D memory d = _read();
        ISchemaRegistry reg = ISchemaRegistry(d.schemaRegistry);

        vm.startBroadcast(key);
        d.schemaClientReview = _ensure(reg, CLIENT_REVIEW);
        d.schemaInterviewResult = _ensure(reg, INTERVIEW_RESULT);
        vm.stopBroadcast();

        _write(d);
        console2.log("ClientReview:");
        console2.logBytes32(d.schemaClientReview);
        console2.log("InterviewResult:");
        console2.logBytes32(d.schemaInterviewResult);
    }

    function _ensure(ISchemaRegistry reg, string memory schema) internal returns (bytes32 uid) {
        // Matches EAS SchemaRegistry._getUID (only one dynamic arg, so no collision).
        // forge-lint: disable-next-line(encode-packed-collision)
        uid = keccak256(abi.encodePacked(schema, address(0), true));
        if (reg.getSchema(uid).uid == bytes32(0)) {
            bytes32 got = reg.register(schema, address(0), true);
            require(got == uid, "unexpected schema uid");
        }
    }
}
