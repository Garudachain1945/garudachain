#!/bin/bash
# =============================================================================
# GarudaChain — Blockchain Reset Script
# Wipes all three regtest nodes back to block 0 (genesis) and restarts fresh.
#
# Usage:
#   ./reset-chain.sh          # interactive (asks for confirmation)
#   ./reset-chain.sh --yes    # non-interactive (skip confirmation prompt)
# =============================================================================
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
WALLETS="$BASEDIR/wallets/garudad"
CLI="$BASEDIR/wallets/garuda-cli"

CBDC_DIR="$HOME/.garudachain-cbdc"
CREATOR_DIR="$HOME/.garudachain-creator"
PUBLIC_DIR="$HOME/.garudachain-public"

if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env}"
: "${GARUDA_RPC_USER_CREATOR:?Set GARUDA_RPC_USER_CREATOR in .env}"
: "${GARUDA_RPC_PASS_CREATOR:?Set GARUDA_RPC_PASS_CREATOR in .env}"
: "${GARUDA_RPC_USER_PUBLIC:?Set GARUDA_RPC_USER_PUBLIC in .env}"
: "${GARUDA_RPC_PASS_PUBLIC:?Set GARUDA_RPC_PASS_PUBLIC in .env}"

CBDC_RPC="-rpcport=19443 -rpcuser=${GARUDA_RPC_USER_CBDC}     -rpcpassword=${GARUDA_RPC_PASS_CBDC}"
CREATOR_RPC="-rpcport=19451 -rpcuser=${GARUDA_RPC_USER_CREATOR} -rpcpassword=${GARUDA_RPC_PASS_CREATOR}"
PUBLIC_RPC="-rpcport=19447 -rpcuser=${GARUDA_RPC_USER_PUBLIC}  -rpcpassword=${GARUDA_RPC_PASS_PUBLIC}"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Confirmation ──────────────────────────────────────────────────────────────
if [[ "${1:-}" != "--yes" ]]; then
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  WARNING: This will DELETE all blockchain data and reset     ║${NC}"
    echo -e "${RED}║  all three nodes (CBDC, Creator, Public) back to BLOCK 0.   ║${NC}"
    echo -e "${RED}║  All wallets, balances, and transaction history will be      ║${NC}"
    echo -e "${RED}║  PERMANENTLY ERASED.                                        ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    read -rp "Type YES to confirm reset: " CONFIRM
    if [[ "$CONFIRM" != "YES" ]]; then
        echo "Reset cancelled."
        exit 0
    fi
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  GarudaChain Blockchain Reset — $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Stop any running nodes ───────────────────────────────────────────
echo -e "${YELLOW}[1/5] Stopping running nodes...${NC}"

stop_node() {
    local name="$1"; shift
    if "$CLI" "$@" stop 2>/dev/null; then
        echo "  [OK] $name stopped"
        sleep 2
    else
        echo "  [--] $name was not running"
    fi
}

stop_node "CBDC"    $CBDC_RPC
stop_node "Creator" $CREATOR_RPC
stop_node "Public"  $PUBLIC_RPC

# Give processes time to exit cleanly
sleep 3

# Force-kill any lingering garudad processes (safety net)
pkill -f "garudad.*garudachain" 2>/dev/null && sleep 2 || true

echo ""

# ── Step 2: Wipe regtest chain data ──────────────────────────────────────────
echo -e "${YELLOW}[2/5] Wiping blockchain data...${NC}"

wipe_regtest() {
    local dir="$1"
    local name="$2"
    if [ -d "$dir/regtest" ]; then
        rm -rf "$dir/regtest"
        echo "  [OK] Wiped $name regtest data"
    else
        echo "  [--] $name had no regtest data"
    fi
    # Also wipe wallets subfolder if present (recreated below)
    rm -rf "$dir/regtest" 2>/dev/null || true
}

wipe_regtest "$CBDC_DIR"    "CBDC"
wipe_regtest "$CREATOR_DIR" "Creator"
wipe_regtest "$PUBLIC_DIR"  "Public"

echo ""

# ── Step 3: Start nodes fresh ─────────────────────────────────────────────────
echo -e "${YELLOW}[3/5] Starting fresh nodes from genesis...${NC}"

nohup "$WALLETS" -datadir="$CBDC_DIR"    -daemon > /tmp/garudad-cbdc.log    2>&1
nohup "$WALLETS" -datadir="$CREATOR_DIR" -daemon > /tmp/garudad-creator.log 2>&1
nohup "$WALLETS" -datadir="$PUBLIC_DIR"  -daemon > /tmp/garudad-public.log  2>&1

echo "  Waiting for nodes to initialize..."
sleep 8

# Verify all three nodes are up
CBDC_OK=0; CREATOR_OK=0; PUBLIC_OK=0

for i in $(seq 1 15); do
    INFO=$("$CLI" $CBDC_RPC getblockchaininfo 2>/dev/null) && CBDC_OK=1 && break || sleep 2
done

for i in $(seq 1 15); do
    INFO=$("$CLI" $CREATOR_RPC getblockchaininfo 2>/dev/null) && CREATOR_OK=1 && break || sleep 2
done

for i in $(seq 1 15); do
    INFO=$("$CLI" $PUBLIC_RPC getblockchaininfo 2>/dev/null) && PUBLIC_OK=1 && break || sleep 2
done

[ "$CBDC_OK"    -eq 1 ] && echo "  [OK] CBDC node    :19443 — block #$("$CLI" $CBDC_RPC getblockcount 2>/dev/null || echo '?')" \
                        || { echo "  [FAIL] CBDC node failed to start"; cat /tmp/garudad-cbdc.log | tail -5; exit 1; }
[ "$CREATOR_OK" -eq 1 ] && echo "  [OK] Creator node :19451 — block #$("$CLI" $CREATOR_RPC getblockcount 2>/dev/null || echo '?')" \
                        || { echo "  [FAIL] Creator node failed to start"; cat /tmp/garudad-creator.log | tail -5; exit 1; }
[ "$PUBLIC_OK"  -eq 1 ] && echo "  [OK] Public node  :19447 — block #$("$CLI" $PUBLIC_RPC getblockcount 2>/dev/null || echo '?')" \
                        || { echo "  [FAIL] Public node failed to start"; cat /tmp/garudad-public.log | tail -5; exit 1; }

echo ""

# ── Step 4: Create wallets ───────────────────────────────────────────────────
echo -e "${YELLOW}[4/5] Creating wallets...${NC}"

create_wallet() {
    local rpc="$1"; local wallet="$2"; local mode="$3"
    "$CLI" $rpc createwallet "$wallet" 2>/dev/null \
        && echo "  [OK] $mode wallet '$wallet' created" \
        || echo "  [--] $mode wallet '$wallet' already exists"
}

create_wallet "$CBDC_RPC"    "cbdc-authority" "CBDC"
create_wallet "$CBDC_RPC"    "cbdc-wallet"    "CBDC"
create_wallet "$CREATOR_RPC" "creator-wallet" "Creator"
create_wallet "$PUBLIC_RPC"  "public-wallet"  "Public"

echo ""

# ── Step 5: Mine 101 initial blocks to fund CBDC authority ───────────────────
echo -e "${YELLOW}[5/5] Mining initial 101 blocks (coinbase maturity)...${NC}"

MINING_ADDR=$("$CLI" $CBDC_RPC -rpcwallet=cbdc-authority getnewaddress "genesis-fund" 2>/dev/null)
if [ -z "$MINING_ADDR" ]; then
    echo "  [FAIL] Could not get mining address from cbdc-authority wallet"
    exit 1
fi

echo "  Mining address: $MINING_ADDR"
"$CLI" $CBDC_RPC generatetoaddress 101 "$MINING_ADDR" > /dev/null

BALANCE=$("$CLI" $CBDC_RPC -rpcwallet=cbdc-authority getbalance 2>/dev/null || echo "?")
BLOCKS=$("$CLI" $CBDC_RPC getblockcount 2>/dev/null || echo "?")

echo "  [OK] Mined 101 blocks — chain height: $BLOCKS"
echo "  [OK] CBDC authority balance: $BALANCE GRD"

# Print genesis block hash for verification
GENESIS_HASH=$("$CLI" $CBDC_RPC getblockhash 0 2>/dev/null || echo "unavailable")
echo ""
echo "  Genesis block hash: $GENESIS_HASH"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  RESET COMPLETE — Blockchain initialized from genesis${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Nodes:"
echo "    CBDC node    — rpc :19443  p2p :19444"
echo "    Creator node — rpc :19451  p2p :19452"
echo "    Public node  — rpc :19447  p2p :19448"
echo ""
echo "  Funded wallet: cbdc-authority  ($BALANCE GRD spendable)"
echo ""
echo "  Run the API:   cd api && ./garudaapi"
echo "  Status:        ./start.sh (skips reset, starts from current chain)"
echo ""
