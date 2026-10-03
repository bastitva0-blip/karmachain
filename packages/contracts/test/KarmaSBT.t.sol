// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {KarmaSBT, IERC5192} from "../src/KarmaSBT.sol";

contract KarmaSBTTest is Test {
    KarmaSBT sbt;
    address admin = makeAddr("admin");
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 constant EVIDENCE = keccak256("evidence-v1");

    function setUp() public {
        sbt = new KarmaSBT(admin, minter, "https://karma.example");
    }

    function _mint(address to, string memory skill, uint8 tier, uint16 score) internal returns (uint256) {
        vm.prank(minter);
        return sbt.mintOrUpdate(to, skill, tier, score, EVIDENCE);
    }

    function test_mint() public {
        vm.expectEmit(address(sbt));
        emit IERC5192.Locked(1);
        uint256 id = _mint(alice, "typescript", 2, 55);

        assertEq(id, 1);
        assertEq(sbt.ownerOf(1), alice);
        assertEq(sbt.balanceOf(alice), 1);
        assertEq(sbt.tokenOf(alice, keccak256("typescript")), 1);

        KarmaSBT.SkillView[] memory list = sbt.getSkills(alice);
        assertEq(list.length, 1);
        assertEq(list[0].name, "typescript");
        assertEq(list[0].tier, 2);
        assertEq(list[0].score, 55);
        assertEq(list[0].evidenceHash, EVIDENCE);
    }

    function test_secondMintUpdatesNotDuplicates() public {
        _mint(alice, "typescript", 1, 30);
        vm.warp(block.timestamp + 1 days);
        vm.prank(minter);
        uint256 id = sbt.mintOrUpdate(alice, "typescript", 3, 81, keccak256("evidence-v2"));

        assertEq(id, 1);
        assertEq(sbt.balanceOf(alice), 1);
        KarmaSBT.SkillView[] memory list = sbt.getSkills(alice);
        assertEq(list.length, 1);
        assertEq(list[0].tier, 3);
        assertEq(list[0].score, 81);
        assertEq(list[0].evidenceHash, keccak256("evidence-v2"));
        assertGt(list[0].updatedAt, list[0].issuedAt);
    }

    function test_differentSkillsGetDifferentTokens() public {
        _mint(alice, "typescript", 1, 30);
        _mint(alice, "rust", 2, 50);
        assertEq(sbt.balanceOf(alice), 2);
        assertEq(sbt.getSkills(alice).length, 2);
    }

    function test_transferFromReverts() public {
        _mint(alice, "typescript", 1, 30);
        vm.prank(alice);
        vm.expectRevert(KarmaSBT.Soulbound.selector);
        sbt.transferFrom(alice, bob, 1);
    }

    function test_safeTransferFromReverts() public {
        _mint(alice, "typescript", 1, 30);
        vm.startPrank(alice);
        vm.expectRevert(KarmaSBT.Soulbound.selector);
        sbt.safeTransferFrom(alice, bob, 1);
        vm.expectRevert(KarmaSBT.Soulbound.selector);
        sbt.safeTransferFrom(alice, bob, 1, "");
        vm.stopPrank();
    }

    function test_approvalsRevert() public {
        _mint(alice, "typescript", 1, 30);
        vm.startPrank(alice);
        vm.expectRevert(KarmaSBT.Soulbound.selector);
        sbt.approve(bob, 1);
        vm.expectRevert(KarmaSBT.Soulbound.selector);
        sbt.setApprovalForAll(bob, true);
        vm.stopPrank();
    }

    function test_onlyMinterCanMint() public {
        bytes32 role = sbt.MINTER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        sbt.mintOrUpdate(alice, "typescript", 3, 100, EVIDENCE);

        // admin is not automatically a minter
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        sbt.mintOrUpdate(alice, "typescript", 3, 100, EVIDENCE);
    }

    function test_revokeBurns() public {
        _mint(alice, "typescript", 2, 50);
        _mint(alice, "rust", 1, 20);

        vm.expectEmit(address(sbt));
        emit KarmaSBT.Revoked(alice, 1, "farmed");
        vm.prank(admin);
        sbt.revoke(1, "farmed");

        assertEq(sbt.balanceOf(alice), 1);
        assertEq(sbt.tokenOf(alice, keccak256("typescript")), 0);
        KarmaSBT.SkillView[] memory list = sbt.getSkills(alice);
        assertEq(list.length, 1);
        assertEq(list[0].name, "rust");
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        sbt.ownerOf(1);

        // re-mint after revoke gets a fresh token
        uint256 id = _mint(alice, "typescript", 1, 10);
        assertEq(id, 3);
    }

    function test_onlyAdminCanRevoke() public {
        _mint(alice, "typescript", 2, 50);
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, minter, bytes32(0))
        );
        sbt.revoke(1, "nope");
    }

    function test_lockedTrue() public {
        _mint(alice, "typescript", 1, 30);
        assertTrue(sbt.locked(1));
    }

    function test_lockedRevertsForMissingToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 42));
        sbt.locked(42);
    }

    function test_supportsInterface() public view {
        assertTrue(sbt.supportsInterface(0xb45a3c0e)); // ERC-5192
        assertTrue(sbt.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(sbt.supportsInterface(type(IERC721).interfaceId));
        assertTrue(sbt.supportsInterface(type(IAccessControl).interfaceId));
        assertFalse(sbt.supportsInterface(0xffffffff));
    }

    function test_invalidInputsRevert() public {
        vm.startPrank(minter);
        vm.expectRevert(abi.encodeWithSelector(KarmaSBT.InvalidTier.selector, 0));
        sbt.mintOrUpdate(alice, "typescript", 0, 10, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(KarmaSBT.InvalidTier.selector, 4));
        sbt.mintOrUpdate(alice, "typescript", 4, 10, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(KarmaSBT.InvalidScore.selector, 101));
        sbt.mintOrUpdate(alice, "typescript", 1, 101, EVIDENCE);
        vm.expectRevert(KarmaSBT.InvalidSkill.selector);
        sbt.mintOrUpdate(alice, "", 1, 10, EVIDENCE);
        vm.expectRevert(KarmaSBT.InvalidSkill.selector);
        sbt.mintOrUpdate(alice, 'ts","x":"', 1, 10, EVIDENCE);
        vm.expectRevert(KarmaSBT.ZeroAddress.selector);
        sbt.mintOrUpdate(address(0), "typescript", 1, 10, EVIDENCE);
        vm.stopPrank();
    }

    function test_tokenURIIsOnChainJson() public {
        _mint(alice, "portfolio:design", 2, 44);
        string memory uri = sbt.tokenURI(1);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
    }

    function _prefix(string memory s, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = b[i];
        return string(out);
    }
}
