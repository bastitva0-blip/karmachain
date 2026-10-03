#!/usr/bin/env bash
# Mints a demo SBT to the relayer, then sends a transfer that reverts on-chain (visible on Basescan).
# Needs: RELAYER_PRIVATE_KEY, RPC_URL in env (source ../../.env).
set -euo pipefail
cd "$(dirname "$0")/.."
SBT=$(grep -o '"sbt": *"0x[0-9a-fA-F]*"' ../shared/deployments.json | grep -o '0x[0-9a-fA-F]*')
ME=$(cast wallet address --private-key "$RELAYER_PRIVATE_KEY")
echo "SBT $SBT  owner $ME"

cast send "$SBT" "mintOrUpdate(address,string,uint8,uint16,bytes32)" "$ME" "demo" 1 10 \
  "$(cast keccak demo-evidence)" --private-key "$RELAYER_PRIVATE_KEY" --rpc-url "$RPC_URL" >/dev/null
ID=$(cast call "$SBT" "tokenOf(address,bytes32)(uint256)" "$ME" "$(cast keccak demo)" --rpc-url "$RPC_URL")
echo "token $ID locked=$(cast call "$SBT" "locked(uint256)(bool)" "$ID" --rpc-url "$RPC_URL")"

echo "simulated transfer:"
cast call "$SBT" "transferFrom(address,address,uint256)" "$ME" 0x000000000000000000000000000000000000dEaD "$ID" \
  --from "$ME" --rpc-url "$RPC_URL" 2>&1 | tail -1 || true

echo "on-chain transfer (expected to fail):"
cast send "$SBT" "transferFrom(address,address,uint256)" "$ME" 0x000000000000000000000000000000000000dEaD "$ID" \
  --gas-limit 100000 --private-key "$RELAYER_PRIVATE_KEY" --rpc-url "$RPC_URL" 2>&1 | grep -Ei "status|transactionHash|error" || true
