#!/bin/bash
# =============================================================================
# GarudaChain — Live Mining Terminal
# Shows real-time block mining with hash, reward, fees, mempool, and balance.
#
# Usage:
#   ./mine-live.sh                 # mine 1 block every 5 seconds forever
#   ./mine-live.sh --interval 2    # mine every 2 seconds
#   ./mine-live.sh --count 50      # stop after 50 blocks
#   ./mine-live.sh --burst 10      # mine 10 blocks per tick (stress test)
# =============================================================================
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$BASEDIR/wallets/garuda-cli"

if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env}"

RPC="-rpcport=19443 -rpcuser=${GARUDA_RPC_USER_CBDC} -rpcpassword=${GARUDA_RPC_PASS_CBDC}"
WALLET="-rpcwallet=cbdc-authority"

INTERVAL=5
COUNT=0        # 0 = infinite
BURST=1

while [[ $# -gt 0 ]]; do
    case "$1" in
        --interval) INTERVAL="$2"; shift 2 ;;
        --count)    COUNT="$2";    shift 2 ;;
        --burst)    BURST="$2";    shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'; BLUE='\033[0;34m'; NC='\033[0m'

# ── Preflight ────────────────────────────────────────────────────────────────
if ! "$CLI" $RPC getblockchaininfo >/dev/null 2>&1; then
    echo "ERROR: CBDC node not reachable. Run ./reset-chain.sh or ./start.sh first."
    exit 1
fi

ADDR=$("$CLI" $RPC $WALLET getnewaddress "miner" 2>/dev/null \
     || "$CLI" $RPC $WALLET getaccountaddress "" 2>/dev/null \
     || echo "")

if [[ -z "$ADDR" ]]; then
    echo "ERROR: Could not get mining address from cbdc-authority wallet."
    exit 1
fi

START_HEIGHT=$("$CLI" $RPC getblockcount)
START_TIME=$(date +%s)

clear 2>/dev/null || printf '\033[2J\033[H'
RED_BOLD='\033[1;31m'
echo -e "${RED_BOLD}"
cat <<'BANNER'
  ██████╗  █████╗ ██████╗ ██╗   ██╗██████╗  █████╗  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
 ██╔════╝ ██╔══██╗██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗██║████╗  ██║
 ██║  ███╗███████║██████╔╝██║   ██║██║  ██║███████║██║     ███████║███████║██║██╔██╗ ██║
 ██║   ██║██╔══██║██╔══██╗██║   ██║██║  ██║██╔══██║██║     ██╔══██║██╔══██║██║██║╚██╗██║
 ╚██████╔╝██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║╚██████╗██║  ██║██║  ██║██║██║ ╚████║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
BANNER
echo -e "${NC}"
echo -e "${BOLD}${CYAN}            ── Live Mining — Block Streamer ──${NC}"
echo ""
echo -e "${DIM}  Miner address:  ${NC}$ADDR"
echo -e "${DIM}  Start height:   ${NC}$START_HEIGHT"
echo -e "${DIM}  Interval:       ${NC}${INTERVAL}s per tick"
echo -e "${DIM}  Blocks/tick:    ${NC}$BURST"
[[ "$COUNT" -gt 0 ]] && echo -e "${DIM}  Target:         ${NC}$COUNT blocks" || echo -e "${DIM}  Target:         ${NC}infinite (Ctrl+C to stop)"
echo -e "${DIM}──────────────────────────────────────────────────────────────────────${NC}"
printf "${BOLD}%-6s  %-8s  %-15s  %-10s  %-10s  %-16s${NC}\n" "#" "HEIGHT" "TIME" "TXS" "MEMPOOL" "BLOCK HASH"
echo -e "${DIM}──────────────────────────────────────────────────────────────────────${NC}"

MINED=0
trap 'echo ""; echo -e "${YELLOW}Stopped by user.${NC}"; exit 0' INT TERM

while :; do
    # Mine a burst of blocks
    HASHES=$("$CLI" $RPC generatetoaddress "$BURST" "$ADDR" 2>/dev/null)

    # Parse the hashes (JSON array)
    while read -r H; do
        [[ -z "$H" ]] && continue
        MINED=$((MINED + 1))

        HEIGHT=$("$CLI" $RPC getblockcount)
        BLOCK_JSON=$("$CLI" $RPC getblock "$H" 2>/dev/null)
        NTX=$(echo "$BLOCK_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['tx']))")
        MEMPOOL=$("$CLI" $RPC getmempoolinfo | python3 -c "import sys,json; print(json.load(sys.stdin)['size'])")
        SHORT_HASH="${H:0:16}..."
        TIMESTAMP=$(date '+%H:%M:%S')

        # Alternate row colors for readability
        if (( MINED % 2 == 0 )); then
            COLOR="${GREEN}"
        else
            COLOR="${BLUE}"
        fi

        printf "${COLOR}%-6d  %-8d  %-15s  %-10s  %-10s  %-16s${NC}\n" \
               "$MINED" "$HEIGHT" "$TIMESTAMP" "$NTX" "$MEMPOOL" "$SHORT_HASH"

        # Every 10 blocks print a summary row
        if (( MINED % 10 == 0 )); then
            BAL=$("$CLI" $RPC $WALLET getbalance)
            NOW=$(date +%s); ELAPSED=$((NOW - START_TIME))
            RATE=$(python3 -c "print(f'{$MINED/max($ELAPSED,1):.2f}')")
            echo -e "${DIM}  └─ balance=${MAGENTA}$BAL GRD${DIM}  elapsed=${ELAPSED}s  rate=${RATE} blk/s${NC}"
        fi

        if [[ "$COUNT" -gt 0 && "$MINED" -ge "$COUNT" ]]; then
            break 2
        fi
    done <<< "$(echo "$HASHES" | python3 -c "import sys,json; [print(h) for h in json.load(sys.stdin)]")"

    sleep "$INTERVAL"
done

# ── Final summary ────────────────────────────────────────────────────────────
END_HEIGHT=$("$CLI" $RPC getblockcount)
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
BAL=$("$CLI" $RPC $WALLET getbalance)

echo -e "${DIM}──────────────────────────────────────────────────────────────────────${NC}"
echo -e "${BOLD}${GREEN}  Mining session complete${NC}"
echo -e "  Blocks mined:    ${BOLD}$MINED${NC}  (${START_HEIGHT} → ${END_HEIGHT})"
echo -e "  Elapsed:         ${ELAPSED}s"
echo -e "  Final balance:   ${BOLD}${MAGENTA}$BAL GRD${NC}"
