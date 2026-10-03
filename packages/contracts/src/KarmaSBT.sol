// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice ERC-5192 minimal soulbound interface. https://eips.ethereum.org/EIPS/eip-5192
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title KarmaSBT
/// @notice Non-transferable skill token. One token per (owner, skill). The minter can raise or
///         lower tier/score as new evidence arrives; the admin can revoke (burn) on fraud.
///         Soulbound stops reputation from being bought. It does not stop it from being farmed,
///         which is why evidence hashes and revocation exist.
contract KarmaSBT is ERC721, AccessControl, IERC5192 {
    using Strings for uint256;
    using Strings for address;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes4 private constant ERC5192_INTERFACE_ID = 0xb45a3c0e;

    uint8 public constant TIER_BASIC = 1;
    uint8 public constant TIER_MEDIUM = 2;
    uint8 public constant TIER_TOP = 3;

    struct Skill {
        bytes32 skillId;
        uint8 tier;
        uint16 score;
        bytes32 evidenceHash;
        uint64 issuedAt;
        uint64 updatedAt;
    }

    /// @notice Everything a reader needs about one token, returned by getSkills.
    struct SkillView {
        uint256 tokenId;
        string name;
        uint8 tier;
        uint16 score;
        bytes32 evidenceHash;
        uint64 issuedAt;
        uint64 updatedAt;
    }

    mapping(uint256 => Skill) public skills;
    mapping(address => mapping(bytes32 => uint256)) public tokenOf;
    mapping(address => uint256[]) private _tokensByOwner;
    mapping(uint256 => uint256) private _ownerIndex; // tokenId => index in _tokensByOwner
    mapping(bytes32 => string) public skillName;

    uint256 private _nextId = 1;
    string public baseExternalUrl;

    event SkillMinted(address indexed owner, uint256 indexed tokenId, bytes32 indexed skillId, uint8 tier, uint16 score, bytes32 evidenceHash);
    event SkillUpdated(address indexed owner, uint256 indexed tokenId, bytes32 indexed skillId, uint8 tier, uint16 score, bytes32 evidenceHash);
    event Revoked(address indexed owner, uint256 indexed tokenId, string reason);
    event BaseExternalUrlSet(string url);

    error Soulbound();
    error InvalidTier(uint8 tier);
    error InvalidScore(uint16 score);
    error InvalidSkill();
    error ZeroAddress();

    constructor(address admin, address minter, string memory externalUrl) ERC721("KarmaChain Skill", "KARMA") {
        if (admin == address(0) || minter == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        baseExternalUrl = externalUrl;
    }

    // ---------------------------------------------------------------- mint / update / revoke

    function mintOrUpdate(address to, string calldata skill, uint8 tier, uint16 score, bytes32 evidenceHash)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (tier < TIER_BASIC || tier > TIER_TOP) revert InvalidTier(tier);
        if (score > 100) revert InvalidScore(score);
        _validateSkill(skill);

        bytes32 skillId = keccak256(bytes(skill));
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp); // safe until year 5e11
        tokenId = tokenOf[to][skillId];

        if (tokenId == 0) {
            tokenId = _nextId++;
            if (bytes(skillName[skillId]).length == 0) skillName[skillId] = skill;
            skills[tokenId] = Skill(skillId, tier, score, evidenceHash, nowTs, nowTs);
            tokenOf[to][skillId] = tokenId;
            _ownerIndex[tokenId] = _tokensByOwner[to].length;
            _tokensByOwner[to].push(tokenId);
            // Plain _mint on purpose: SBTs need no receiver hook, and skipping it removes a reentrancy path.
            // forge-lint: disable-next-line(unsafe-oz-erc721-mint)
            _mint(to, tokenId);
            emit Locked(tokenId);
            emit SkillMinted(to, tokenId, skillId, tier, score, evidenceHash);
        } else {
            Skill storage s = skills[tokenId];
            s.tier = tier;
            s.score = score;
            s.evidenceHash = evidenceHash;
            s.updatedAt = nowTs;
            emit SkillUpdated(to, tokenId, skillId, tier, score, evidenceHash);
        }
    }

    function revoke(uint256 tokenId, string calldata reason) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address owner = _requireOwned(tokenId);
        bytes32 skillId = skills[tokenId].skillId;

        // swap-and-pop from the owner's list
        uint256[] storage list = _tokensByOwner[owner];
        uint256 idx = _ownerIndex[tokenId];
        uint256 last = list[list.length - 1];
        list[idx] = last;
        _ownerIndex[last] = idx;
        list.pop();

        delete _ownerIndex[tokenId];
        delete tokenOf[owner][skillId];
        delete skills[tokenId];
        _burn(tokenId);
        emit Revoked(owner, tokenId, reason);
    }

    function setBaseExternalUrl(string calldata url) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseExternalUrl = url;
        emit BaseExternalUrlSet(url);
    }

    // ---------------------------------------------------------------- reads

    function getSkills(address owner) external view returns (SkillView[] memory out) {
        uint256[] storage ids = _tokensByOwner[owner];
        out = new SkillView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Skill storage s = skills[ids[i]];
            out[i] = SkillView(ids[i], skillName[s.skillId], s.tier, s.score, s.evidenceHash, s.issuedAt, s.updatedAt);
        }
    }

    function tokensByOwner(address owner) external view returns (uint256[] memory) {
        return _tokensByOwner[owner];
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address owner = _requireOwned(tokenId);
        Skill storage s = skills[tokenId];
        string memory name = skillName[s.skillId];
        string memory tierName = s.tier == TIER_TOP ? "Top" : s.tier == TIER_MEDIUM ? "Medium" : "Basic";

        // skill names are restricted to [a-z0-9+#._:-] in _validateSkill, so no JSON escaping is needed.
        string memory json = string.concat(
            '{"name":"KarmaChain ', name, " - ", tierName, '",',
            '"description":"Soulbound proof of verified work. Evidence hash links to the off-chain evidence JSON.",',
            '"external_url":"', baseExternalUrl, "/u/", owner.toHexString(), '",',
            '"attributes":[',
            '{"trait_type":"skill","value":"', name, '"},',
            '{"trait_type":"tier","value":"', tierName, '"},',
            '{"trait_type":"score","display_type":"number","value":', uint256(s.score).toString(), "},",
            '{"trait_type":"evidenceHash","value":"', uint256(s.evidenceHash).toHexString(32), '"}',
            "]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return interfaceId == ERC5192_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------- soulbound enforcement

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ---------------------------------------------------------------- internal

    function _validateSkill(string calldata skill) private pure {
        bytes calldata b = bytes(skill);
        if (b.length == 0 || b.length > 48) revert InvalidSkill();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == "+" || c == "#" || c == "." || c == "_" || c == ":" || c == "-";
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (!ok) revert InvalidSkill();
        }
    }
}
