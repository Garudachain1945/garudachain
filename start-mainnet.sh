#!/bin/bash
# GarudaChain Mainnet Startup
BASEDIR="$(cd "$(dirname "$0")" && pwd)"
WALLETS="$BASEDIR/wallets/garudad"
CLI="$BASEDIR/wallets/garuda-cli"

if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_MAINNET:?Set GARUDA_RPC_USER_MAINNET in .env}"
: "${GARUDA_RPC_PASS_MAINNET:?Set GARUDA_RPC_PASS_MAINNET in .env}"
: "${GARUDA_RPC_USER_MAINNET2:=${GARUDA_RPC_USER_MAINNET}}"
: "${GARUDA_RPC_PASS_MAINNET2:=${GARUDA_RPC_PASS_MAINNET}}"

RPC_N1="-rpcport=6301 -rpcuser=${GARUDA_RPC_USER_MAINNET}  -rpcpassword=${GARUDA_RPC_PASS_MAINNET}"
RPC_N2="-rpcport=6303 -rpcuser=${GARUDA_RPC_USER_MAINNET2} -rpcpassword=${GARUDA_RPC_PASS_MAINNET2}"

echo "=== GarudaChain Mainnet ==="

# Start two peered mainnet nodes (getblocktemplate needs >=1 peer)
"$WALLETS" -datadir="$HOME/.garudachain-mainnet"  -daemon > /dev/null 2>&1
sleep 1
"$WALLETS" -datadir="$HOME/.garudachain-mainnet2" -daemon > /dev/null 2>&1
sleep 2

# Verify node 1
BLOCKS=$("$CLI" $RPC_N1 getblockcount 2>/dev/null)
if [ -n "$BLOCKS" ]; then
    echo "  [OK] Mainnet node 1 :6301 — block #$BLOCKS"
else
    echo "  [WARN] Mainnet node 1 not responding"
fi

BLOCKS2=$("$CLI" $RPC_N2 getblockcount 2>/dev/null)
[ -n "$BLOCKS2" ] && echo "  [OK] Mainnet node 2 :6303 — block #$BLOCKS2" || echo "  [WARN] Mainnet node 2 not responding"

PEERS=$("$CLI" $RPC_N1 getconnectioncount 2>/dev/null)
echo "  Peers: $PEERS"

# Load mainnet wallet if exists
"$CLI" $RPC_N1 loadwallet "mainnet-miner" 2>/dev/null

echo ""
echo "=== Mainnet ready ==="
echo "  Start GPU miner: ./miner/garuda-gpu-miner --rpc-url http://127.0.0.1:6301 \\"
echo "                   --rpc-user \"\$GARUDA_RPC_USER_MAINNET\" \\"
echo "                   --rpc-pass \"\$GARUDA_RPC_PASS_MAINNET\" --wallet mainnet-miner"
