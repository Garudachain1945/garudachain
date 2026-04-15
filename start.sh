#!/bin/bash
# GarudaChain — Start All Services
BASEDIR="$(cd "$(dirname "$0")" && pwd)"
WALLETS="$BASEDIR/wallets/garudad"
CLI="$BASEDIR/wallets/garuda-cli"
API_DIR="$BASEDIR/api"

if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env (copy .env.example)}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env (copy .env.example)}"
: "${GARUDA_RPC_USER_CREATOR:?Set GARUDA_RPC_USER_CREATOR in .env}"
: "${GARUDA_RPC_PASS_CREATOR:?Set GARUDA_RPC_PASS_CREATOR in .env}"
: "${GARUDA_RPC_USER_PUBLIC:?Set GARUDA_RPC_USER_PUBLIC in .env}"
: "${GARUDA_RPC_PASS_PUBLIC:?Set GARUDA_RPC_PASS_PUBLIC in .env}"

echo "=== GarudaChain Startup ==="

# ─── 1. Start Blockchain Nodes ───
echo "[1/3] Starting blockchain nodes..."
nohup "$WALLETS" -datadir="$HOME/.garudachain-cbdc"     -daemon > /dev/null 2>&1
nohup "$WALLETS" -datadir="$HOME/.garudachain-creator"  -daemon > /dev/null 2>&1
nohup "$WALLETS" -datadir="$HOME/.garudachain-public"   -daemon > /dev/null 2>&1
sleep 6

# Verify nodes
BLOCKS=$("$CLI" -rpcport=19443 -rpcuser="$GARUDA_RPC_USER_CBDC" -rpcpassword="$GARUDA_RPC_PASS_CBDC" getblockcount 2>/dev/null)
if [ -n "$BLOCKS" ]; then
    echo "  [OK] CBDC node   :19443 — block #$BLOCKS"
else
    echo "  [WARN] CBDC node not responding"
fi

BLOCKS2=$("$CLI" -rpcport=19451 -rpcuser="$GARUDA_RPC_USER_CREATOR" -rpcpassword="$GARUDA_RPC_PASS_CREATOR" getblockcount 2>/dev/null)
[ -n "$BLOCKS2" ] && echo "  [OK] Creator node :19451 — block #$BLOCKS2" || echo "  [WARN] Creator node not responding"

BLOCKS3=$("$CLI" -rpcport=19447 -rpcuser="$GARUDA_RPC_USER_PUBLIC" -rpcpassword="$GARUDA_RPC_PASS_PUBLIC" getblockcount 2>/dev/null)
[ -n "$BLOCKS3" ] && echo "  [OK] Public node  :19447 — block #$BLOCKS3" || echo "  [WARN] Public node not responding"

# ─── 2. Start REST API ───
echo "[2/3] Starting REST API on :5000..."
cd "$API_DIR" || exit 1
nohup ./garuda-api > api.log 2>&1 &
sleep 2
STATUS=$(curl -s http://127.0.0.1:5000/api/healthz 2>/dev/null | grep -o 'ok')
[ "$STATUS" = "ok" ] && echo "  [OK] API running on http://localhost:5000" || echo "  [WARN] API not responding"

# ─── 3. Start Website Dev Server ───
echo "[3/3] Starting website dev server on :5174..."
cd "$BASEDIR/website" || exit 1
nohup npm run dev > website.log 2>&1 &
sleep 3
echo "  [OK] Website: http://localhost:5174"

echo ""
echo "=== All services started ==="
echo "  Blockchain:  :19443 (CBDC) | :19451 (Creator) | :19447 (Public)"
echo "  API:         http://localhost:5000"
echo "  Website:     http://localhost:5174"
echo "  API Log:     $API_DIR/api.log"
echo "  Website Log: $BASEDIR/website/website.log"
