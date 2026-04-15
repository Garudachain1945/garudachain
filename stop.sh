#!/bin/bash
# GarudaChain — Stop All Services
BASEDIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$BASEDIR/wallets/garuda-cli"

if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env}"
: "${GARUDA_RPC_USER_CREATOR:?Set GARUDA_RPC_USER_CREATOR in .env}"
: "${GARUDA_RPC_PASS_CREATOR:?Set GARUDA_RPC_PASS_CREATOR in .env}"
: "${GARUDA_RPC_USER_PUBLIC:?Set GARUDA_RPC_USER_PUBLIC in .env}"
: "${GARUDA_RPC_PASS_PUBLIC:?Set GARUDA_RPC_PASS_PUBLIC in .env}"

echo "=== GarudaChain Shutdown ==="

echo "[1/3] Stopping blockchain nodes..."
"$CLI" -rpcport=19443 -rpcuser="$GARUDA_RPC_USER_CBDC"    -rpcpassword="$GARUDA_RPC_PASS_CBDC"    stop 2>/dev/null && echo "  [OK] CBDC node stopped"
"$CLI" -rpcport=19451 -rpcuser="$GARUDA_RPC_USER_CREATOR" -rpcpassword="$GARUDA_RPC_PASS_CREATOR" stop 2>/dev/null && echo "  [OK] Creator node stopped"
"$CLI" -rpcport=19447 -rpcuser="$GARUDA_RPC_USER_PUBLIC"  -rpcpassword="$GARUDA_RPC_PASS_PUBLIC"  stop 2>/dev/null && echo "  [OK] Public node stopped"

echo "[2/3] Stopping REST API..."
kill $(lsof -ti:5000) 2>/dev/null && echo "  [OK] API stopped"

echo "[3/3] Stopping website..."
kill $(lsof -ti:5174) 2>/dev/null && echo "  [OK] Website stopped"

echo "=== All services stopped ==="
