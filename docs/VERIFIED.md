# Verified external facts

Every external fact (model IDs, contract addresses, package names, endpoints) gets a row once confirmed against current docs.

| Item | Value | Source | Date |
|---|---|---|---|
| ERC-5192 interface ID | `0xb45a3c0e`; `locked()` throws for nonexistent tokens; emit `Locked` on mint | https://eips.ethereum.org/EIPS/eip-5192 | 2026-09-30 |
| EAS on Base Sepolia (v1.2.0) | `0x4200000000000000000000000000000000000021` | https://github.com/ethereum-attestation-service/eas-contracts#deployments + on-chain `version()` = 1.2.0 | 2026-09-30 |
| EAS SchemaRegistry on Base Sepolia (v1.2.0) | `0x4200000000000000000000000000000000000020` | same README + on-chain `EAS.getSchemaRegistry()` | 2026-09-30 |
| EAS EIP712Proxy on Base Sepolia (v1.3.0) | `0xAd64A04c20dDBbA7cBb0EcAe4823095B4adA5c57` | same README | 2026-09-30 |
| Schema UID formula | `keccak256(abi.encodePacked(schema, resolver, revocable))` | eas-contracts `SchemaRegistry._getUID`; confirmed by fork dry-run | 2026-09-30 |
| Base Sepolia RPC / chainId | `https://sepolia.base.org` / `84532` | `cast chain-id` | 2026-09-30 |
| OpenZeppelin Contracts | `5.6.1` (npm `latest`) | https://www.npmjs.com/package/@openzeppelin/contracts | 2026-09-30 |
| Foundry | forge 1.8.3 | `forge --version` | 2026-09-30 |
| NVIDIA base URL / chat | `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible) | https://docs.api.nvidia.com/nim/reference/llm-apis | 2026-10-01 |
| NVIDIA LLM candidates | `meta/llama-3.3-70b-instruct`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`, `qwen/qwen3-next-80b-a3b-instruct` (tool-calling support not documented there; code falls back to JSON mode) | same | 2026-10-01 |
| NVIDIA embeddings | `nvidia/nv-embedqa-e5-v5`, `input_type` = `query`/`passage`, `truncate` = `NONE`/`START`/`END` | https://docs.api.nvidia.com/nim/reference/nvidia-nv-embedqa-e5-v5-infer | 2026-10-01 |
| GitHub OAuth | authorize `https://github.com/login/oauth/authorize`, token `POST https://github.com/login/oauth/access_token` (Accept: application/json), scope `read:user` | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps | 2026-10-01 |
| GitHub REST | `X-GitHub-Api-Version: 2022-11-28`; search `is:pr is:merged author:X -user:X` | https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests | 2026-10-01 |
| ElevenLabs signed URL | `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…` (header `xi-api-key`) → `{ signed_url }` | https://elevenlabs.io/docs/api-reference/conversations/get-signed-url | 2026-10-01 |
| ElevenLabs conversation | `GET /v1/convai/conversations/{id}`; status `initiated/in-progress/processing/done/failed`; transcript items `role` (user/agent), `message`, `time_in_call_secs` | https://elevenlabs.io/docs/api-reference/conversations/get | 2026-10-01 |
| ElevenLabs React SDK | `@elevenlabs/react` 1.16.0: `ConversationProvider` + `useConversation()`; `startSession({ signedUrl, dynamicVariables })`, `onConnect({conversationId})`, `onMessage({source, message})`, `isSpeaking`, `setMuted`, `endSession` | node_modules/@elevenlabs/react/dist/*.d.ts | 2026-10-01 |
| ElevenLabs TTS | `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, body `{ text, model_id }`, models `eleven_multilingual_v2`, `eleven_flash_v2_5` | https://elevenlabs.io/docs/api-reference/text-to-speech/convert | 2026-10-01 |
| ElevenLabs STT (Scribe) | `POST /v1/speech-to-text` multipart `model_id` + `file` → `{ text }`; model id configurable via `ELEVENLABS_STT_MODEL` (default `scribe_v1`, confirm in dashboard) | https://elevenlabs.io/docs/api-reference/speech-to-text/convert | 2026-10-01 |
| EAS GraphQL | `POST https://base-sepolia.easscan.org/graphql`, `attestations(where: { recipient, schemaId: { in } })` | live query | 2026-10-01 |
| EAS v1.2.0 delegated Attest EIP-712 type | `Attest(bytes32 schema,address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value,uint256 nonce,uint64 deadline)`, domain name `EAS`, version from `version()`; typehash `0xf83bb2b0…3d3f` | on-chain `getAttestTypeHash()` + fork test `apps/api/test/eas.fork.test.ts` | 2026-10-01 |
| NVIDIA models (live check) | `meta/llama-3.3-70b-instruct` and `nvidia/nv-embedqa-e5-v5` are **EOL (HTTP 410)**. Using `nvidia/nemotron-3.5-lightning-30b-a3b` (tool calling OK, ~2 s; send `chat_template_kwargs.enable_thinking=false` for plain JSON) and `nvidia/nemotron-3-embed-1b` (2048-dim, `input_type` query/passage) | `GET /v1/models` + test calls with the project key | 2026-10-02 |
| KarmaSBT (Base Sepolia) | `0x42dd54F23A31AA40634c428999AaB584d04cf3D1` (admin `0x5A0c…3305`, minter/relayer `0x575B…B17E`); soulbound transfer revert tx `0x9f85ac5b…2169` | https://sepolia.basescan.org/address/0x42dd54F23A31AA40634c428999AaB584d04cf3D1 | 2026-10-02 |
| EAS schemas | ClientReview `0x67631ece…1d04`, InterviewResult `0xa30737f9…fc92` | https://base-sepolia.easscan.org/schema/view/0x67631ece60fc4d5da35c5d1d86a29424e9cc277a7a3223b60a51dec33f181d04 | 2026-10-02 |
| Vakh MCP endpoint | `https://xo.vakh.com/mcp` (Streamable HTTP; unauthenticated POST → `401` + `WWW-Authenticate: Bearer resource_metadata="https://xo.vakh.com/.well-known/oauth-protected-resource"`). Docs page: https://vakh.com/mcp | live probe | 2026-10-03 |
| Vakh OAuth | issuer `https://xo.vakh.com`; authorize `/api/auth/mcp/authorize`, token `/api/auth/mcp/token`, dynamic client registration `/api/auth/mcp/register`; `authorization_code` + `refresh_token`; scopes `openid profile email offline_access` | https://xo.vakh.com/.well-known/oauth-authorization-server | 2026-10-03 |
| Vakh MCP tools | `vakh-mcp` 1.0.0: `list_forms`, `get_form`, `create_form`, `update_form`, `archive_form`, `unarchive_form`, `list_posts`, `get_post`, `create_post`, `update_post`, `publish_post`, `archive_post`, `unarchive_post`, `delete_draft_post`, `list_drafts`, `list_archived`, `list_badges`, `get_badge`, `create_badge`, `update_badge`, `query_view`, `aggregate_view`, `get_form_schema_reference` | live `tools/list` after OAuth | 2026-10-03 |
| Vakh post write shapes | `option` = array of option ids; `url` = array of strings; `longform` = plain string (auto-wrapped); `datetime` = `{ start: "<ISO UTC with Z>", precision }` (offsets rejected); `reference` = `[{ id: <post UUID>, type: "reference" }]`, gated by the source form's `accepts_references` + reader access | live `get_form_schema_reference` | 2026-10-03 |
| Vakh boundaries | Form sharing/public visibility, subscriptions, badge membership and messaging are human-only (not exposed over MCP) | live `get_form_schema_reference` | 2026-10-03 |
| Vakh tokens | access token `expires_in` 3600 s; refresh tokens **rotate** on every refresh (persist the new one) | live refresh grant | 2026-10-03 |
| Vakh web routes | `/form/{formId}`, `/form/{formId}/view/{viewId}`, `/post/{postId}` | vakh.com route manifest | 2026-10-03 |
| MCP TypeScript SDK | `@modelcontextprotocol/sdk` 1.32.0: `Client`, `StreamableHTTPClientTransport` (`requestInit` headers), `client/auth.js` `registerClient` / `startAuthorization` / `exchangeAuthorization` / `refreshAuthorization` | https://www.npmjs.com/package/@modelcontextprotocol/sdk | 2026-10-03 |
