#!/bin/bash
# =============================================================================
# GarudaChain — Interactive Wallet Terminal
# Menu-driven UI for create wallet, import private key, mining, send, balance.
# =============================================================================
set -u

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$BASEDIR/wallets/garuda-cli"

# Load RPC credentials from .env if present; otherwise require env vars.
if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env (see .env.example)}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env (see .env.example)}"
: "${GARUDA_RPC_USER_CREATOR:?Set GARUDA_RPC_USER_CREATOR in .env (see .env.example)}"
: "${GARUDA_RPC_PASS_CREATOR:?Set GARUDA_RPC_PASS_CREATOR in .env (see .env.example)}"
: "${GARUDA_RPC_USER_PUBLIC:?Set GARUDA_RPC_USER_PUBLIC in .env (see .env.example)}"
: "${GARUDA_RPC_PASS_PUBLIC:?Set GARUDA_RPC_PASS_PUBLIC in .env (see .env.example)}"
: "${GARUDA_RPC_USER_MAINNET:=${GARUDA_RPC_USER_PUBLIC}}"
: "${GARUDA_RPC_PASS_MAINNET:=${GARUDA_RPC_PASS_PUBLIC}}"

RPC_CBDC="-rpcport=19443 -rpcuser=${GARUDA_RPC_USER_CBDC}     -rpcpassword=${GARUDA_RPC_PASS_CBDC}"
RPC_CREATOR="-rpcport=19451 -rpcuser=${GARUDA_RPC_USER_CREATOR} -rpcpassword=${GARUDA_RPC_PASS_CREATOR}"
RPC_PUBLIC="-rpcport=19447 -rpcuser=${GARUDA_RPC_USER_PUBLIC}  -rpcpassword=${GARUDA_RPC_PASS_PUBLIC}"
RPC_MAINNET="-rpcport=6301  -rpcuser=${GARUDA_RPC_USER_MAINNET}   -rpcpassword=${GARUDA_RPC_PASS_MAINNET}"

# Default RPC target (Mainnet)
RPC="$RPC_MAINNET"
NODE_NAME="Mainnet"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; BLUE='\033[0;34m'
RED_BOLD='\033[1;31m'

# ── Helpers ───────────────────────────────────────────────────────────────────
banner() {
    clear 2>/dev/null || printf '\033[2J\033[H'
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
    echo -e "${BOLD}${CYAN}        ── Wallet Terminal — ${NODE_NAME} Node ──${NC}"
    echo ""
}

pause() {
    echo ""
    read -rp "$(echo -e "${DIM}Press ENTER to continue...${NC}")" _
}

err()  { echo -e "${RED}✗ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
info() { echo -e "${CYAN}ℹ $1${NC}"; }

require_node() {
    if ! "$CLI" $RPC getblockchaininfo >/dev/null 2>&1; then
        err "$NODE_NAME node (port in $RPC) is not reachable."
        err "Run ./reset-chain.sh or ./start.sh first."
        exit 1
    fi
}

list_wallets() {
    "$CLI" $RPC listwallets 2>/dev/null | python3 -c "
import sys, json
try:
    wallets = json.load(sys.stdin)
    for i, w in enumerate(wallets, 1):
        print(f'  [{i}] {w}')
    print(f'__count__:{len(wallets)}')
except Exception:
    print('__count__:0')
"
}

select_wallet() {
    local prompt="${1:-Select wallet}"
    local output; output=$(list_wallets)
    local count; count=$(echo "$output" | grep '__count__' | cut -d: -f2)

    if [[ "$count" -eq 0 ]]; then
        err "No wallets loaded on $NODE_NAME node."
        return 1
    fi

    echo -e "${BOLD}Loaded wallets:${NC}"
    echo "$output" | grep -v '__count__'
    echo ""
    read -rp "$prompt [1-$count]: " idx
    if ! [[ "$idx" =~ ^[0-9]+$ ]] || [[ "$idx" -lt 1 ]] || [[ "$idx" -gt "$count" ]]; then
        err "Invalid selection."
        return 1
    fi
    SELECTED_WALLET=$(echo "$output" | grep -v '__count__' | sed -n "${idx}p" | sed 's/^ *\[[0-9]*\] //')
    return 0
}

# =============================================================================
# ACTIONS
# =============================================================================

action_create_wallet() {
    banner
    echo -e "${BOLD}${GREEN}[1] CREATE NEW WALLET${NC}"
    echo ""
    read -rp "Wallet name: " NAME
    [[ -z "$NAME" ]] && { err "Name cannot be empty."; pause; return; }

    read -rp "Encrypt with passphrase? (y/N): " ENC
    if [[ "$ENC" =~ ^[Yy]$ ]]; then
        read -rsp "Passphrase: " PASS; echo
        RESULT=$("$CLI" $RPC createwallet "$NAME" false false "$PASS" 2>&1)
    else
        RESULT=$("$CLI" $RPC createwallet "$NAME" 2>&1)
    fi

    if echo "$RESULT" | grep -q '"name"'; then
        ok "Wallet '$NAME' created."
        ADDR=$("$CLI" $RPC -rpcwallet="$NAME" getnewaddress "receive" 2>/dev/null)
        [[ -n "$ADDR" ]] && info "First address: $ADDR"
    else
        err "Failed to create wallet:"
        echo "$RESULT"
    fi
    pause
}

action_import_privkey() {
    banner
    echo -e "${BOLD}${GREEN}[2] IMPORT PRIVATE KEY${NC}"
    echo ""
    if ! select_wallet "Import into which wallet?"; then pause; return; fi
    local W="$SELECTED_WALLET"

    echo ""
    read -rsp "Private key (WIF format): " PRIVKEY; echo
    [[ -z "$PRIVKEY" ]] && { err "Private key cannot be empty."; pause; return; }

    read -rp "Label for this key (optional): " LABEL
    LABEL="${LABEL:-imported}"

    info "Importing into '$W' (this may trigger a rescan — can take time)..."
    RESULT=$("$CLI" $RPC -rpcwallet="$W" importprivkey "$PRIVKEY" "$LABEL" true 2>&1)

    if [[ -z "$RESULT" ]]; then
        ok "Private key imported successfully into '$W'."
        BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null)
        info "Wallet balance now: $BAL GRD"
    else
        err "Import failed:"
        echo "$RESULT"
    fi
    pause
}

action_mining() {
    if ! select_wallet "Mine rewards to which wallet?"; then pause; return; fi
    local W="$SELECTED_WALLET"

    local HOST="127.0.0.1"
    local PORT USER PASS
    case "$NODE_NAME" in
        Mainnet) PORT=6301;  USER=garudamain;    PASS=garudamain2026 ;;
        CBDC)    PORT=19443; USER=garudacbdc;    PASS=garudacbdc123 ;;
        Creator) PORT=19451; USER=garudacreator; PASS=garudacreator123 ;;
        Public)  PORT=19447; USER=garudapublic;  PASS=garudapublic123 ;;
    esac

    local GPU_MINER="$BASEDIR/miner/garuda-gpu-miner"

    if [[ ! -x "$GPU_MINER" ]]; then
        err "GPU miner not found at $GPU_MINER"
        err "Build it: cd miner && nvcc -O3 -arch=sm_86 -o garuda-gpu-miner garuda-gpu-miner.cu -lcurl -lssl -lcrypto"
        pause
        return
    fi

    local START_BAL; START_BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null || echo "0")
    local START_HEIGHT; START_HEIGHT=$("$CLI" $RPC getblockcount 2>/dev/null || echo "0")

    # Launch CUDA GPU miner (SHA3-256 PQC PoW)
    "$GPU_MINER" \
        --rpc-url "http://${HOST}:${PORT}" \
        --rpc-user "$USER" --rpc-pass "$PASS" \
        --wallet "$W"

    # After Ctrl+C, show summary
    echo ""
    echo -e "${DIM}──────────────────────────────────────────────────────────────────────────${NC}"
    local END_BAL; END_BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null || echo "?")
    local END_HEIGHT; END_HEIGHT=$("$CLI" $RPC getblockcount 2>/dev/null || echo "?")
    echo -e "  ${BOLD}${GREEN}Mining session ended${NC}"
    echo -e "  Blocks mined:   ${BOLD}$(( END_HEIGHT - START_HEIGHT ))${NC}  ($START_HEIGHT → $END_HEIGHT)"
    echo -e "  Start balance:  $START_BAL GRD"
    echo -e "  Final balance:  ${BOLD}${MAGENTA}$END_BAL GRD${NC}"
    pause
}

action_send() {
    banner
    echo -e "${BOLD}${GREEN}[4] SEND GRD${NC}"
    echo ""
    if ! select_wallet "Send from which wallet?"; then pause; return; fi
    local W="$SELECTED_WALLET"

    BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null)
    info "Wallet '$W' balance: $BAL GRD"
    echo ""
    read -rp "Recipient address (grd1...): " TO_ADDR
    [[ -z "$TO_ADDR" ]] && { err "Address required."; pause; return; }

    read -rp "Amount in GRD: " AMOUNT
    [[ ! "$AMOUNT" =~ ^[0-9]+(\.[0-9]+)?$ ]] && { err "Invalid amount."; pause; return; }

    read -rp "Comment (optional): " COMMENT
    COMMENT="${COMMENT:-}"

    echo ""
    echo -e "${YELLOW}Confirm transaction:${NC}"
    echo "  From:    $W"
    echo "  To:      $TO_ADDR"
    echo "  Amount:  $AMOUNT GRD"
    echo "  Comment: $COMMENT"
    echo ""
    read -rp "Send? (yes/no): " CONFIRM
    [[ "$CONFIRM" != "yes" ]] && { info "Cancelled."; pause; return; }

    if [[ -n "$COMMENT" ]]; then
        TXID=$("$CLI" $RPC -rpcwallet="$W" sendtoaddress "$TO_ADDR" "$AMOUNT" "$COMMENT" 2>&1)
    else
        TXID=$("$CLI" $RPC -rpcwallet="$W" sendtoaddress "$TO_ADDR" "$AMOUNT" 2>&1)
    fi

    if [[ "$TXID" =~ ^[0-9a-f]{64}$ ]]; then
        ok "Transaction broadcast successfully!"
        info "TXID: $TXID"
        NEW_BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null)
        info "New balance: $NEW_BAL GRD"
        echo ""
        info "Tip: mine 1 block to confirm the transaction:"
        echo "     from the menu → [3] Mining → 1 block"
    else
        err "Send failed:"
        echo "$TXID"
    fi
    pause
}

action_balance() {
    banner
    echo -e "${BOLD}${GREEN}[5] BALANCES & ADDRESSES${NC}"
    echo ""
    local output; output=$(list_wallets)
    local count; count=$(echo "$output" | grep '__count__' | cut -d: -f2)
    if [[ "$count" -eq 0 ]]; then
        err "No wallets loaded."; pause; return
    fi

    printf "${BOLD}  %-22s  %-15s  %s${NC}\n" "WALLET" "BALANCE (GRD)" "RECEIVE ADDRESS"
    echo -e "${DIM}──────────────────────────────────────────────────────────────────────${NC}"
    while read -r line; do
        W=$(echo "$line" | sed 's/^ *\[[0-9]*\] //')
        BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null || echo "?")
        ADDR=$("$CLI" $RPC -rpcwallet="$W" getnewaddress 2>/dev/null || echo "?")
        printf "  ${CYAN}%-22s${NC}  ${MAGENTA}%-15s${NC}  ${DIM}%s${NC}\n" "$W" "$BAL" "$ADDR"
    done <<< "$(echo "$output" | grep -v '__count__')"

    echo ""
    HEIGHT=$("$CLI" $RPC getblockcount 2>/dev/null)
    info "Current chain height: $HEIGHT"
    pause
}

action_mint() {
    banner
    echo -e "${BOLD}${GREEN}[7] MINT GRD  ${DIM}(sovereign one-time issuance)${NC}"
    echo ""
    if [[ "$NODE_NAME" != "Mainnet" ]]; then
        err "Mint only available on Mainnet node. Switch via [6]."
        pause; return
    fi
    if ! select_wallet "Mint into which wallet?"; then pause; return; fi
    local W="$SELECTED_WALLET"

    echo ""
    read -rp "Amount to mint (whole GRD, integer): " AMOUNT
    if ! [[ "$AMOUNT" =~ ^[0-9]+$ ]] || [[ "$AMOUNT" -eq 0 ]]; then
        err "Invalid amount."; pause; return
    fi

    local H; H=$("$CLI" $RPC getblockcount 2>/dev/null)
    local TARGET_H=$((H + 1))

    echo ""
    echo -e "${YELLOW}Confirm sovereign mint:${NC}"
    echo "  Wallet:        $W"
    echo "  Amount:        $AMOUNT GRD"
    echo "  Target block:  #$TARGET_H"
    echo ""
    read -rp "Execute mint? (yes/no): " CONFIRM
    [[ "$CONFIRM" != "yes" ]] && { info "Cancelled."; pause; return; }

    # Write the mint directive that GetBlockSubsidy reads
    echo "$TARGET_H $AMOUNT" > /tmp/garuda-mint
    ok "Mint directive written: height=$TARGET_H amount=$AMOUNT GRD"

    local GPU_MINER="$BASEDIR/miner/garuda-gpu-miner"
    if [[ ! -x "$GPU_MINER" ]]; then
        err "GPU miner not found at $GPU_MINER"
        rm -f /tmp/garuda-mint; pause; return
    fi

    local PORT=6301 USER=garudamain PASS=garudamain2026
    local START_BAL; START_BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null)

    info "Launching GPU miner — will auto-stop after block #$TARGET_H is sealed..."
    echo ""

    # Run miner in background, kill once target height reached
    "$GPU_MINER" \
        --rpc-url "http://127.0.0.1:${PORT}" \
        --rpc-user "$USER" --rpc-pass "$PASS" \
        --wallet "$W" &
    local MPID=$!

    while :; do
        sleep 2
        local CUR; CUR=$("$CLI" $RPC getblockcount 2>/dev/null || echo "$H")
        if [[ "$CUR" -ge "$TARGET_H" ]]; then
            kill -INT "$MPID" 2>/dev/null
            wait "$MPID" 2>/dev/null
            break
        fi
        if ! kill -0 "$MPID" 2>/dev/null; then break; fi
    done

    rm -f /tmp/garuda-mint

    echo ""
    local END_BAL; END_BAL=$("$CLI" $RPC -rpcwallet="$W" getbalance 2>/dev/null)
    ok "Mint complete."
    info "Start balance: $START_BAL GRD"
    info "Final balance: $END_BAL GRD"
    pause
}

action_switch_node() {
    banner
    echo -e "${BOLD}${GREEN}[6] SWITCH NODE${NC}"
    echo ""
    echo "  [1] Mainnet node  (port 6301)  ${BOLD}${GREEN}[LIVE]${NC}"
    echo "  [2] CBDC node     (port 19443) ${DIM}(regtest)${NC}"
    echo "  [3] Creator node  (port 19451) ${DIM}(regtest)${NC}"
    echo "  [4] Public node   (port 19447) ${DIM}(regtest)${NC}"
    echo ""
    read -rp "Select node: " N
    case "$N" in
        1) RPC="$RPC_MAINNET"; NODE_NAME="Mainnet"; ok "Switched to Mainnet node." ;;
        2) RPC="$RPC_CBDC";    NODE_NAME="CBDC";    ok "Switched to CBDC node." ;;
        3) RPC="$RPC_CREATOR"; NODE_NAME="Creator"; ok "Switched to Creator node." ;;
        4) RPC="$RPC_PUBLIC";  NODE_NAME="Public";  ok "Switched to Public node." ;;
        *) err "Invalid selection." ;;
    esac
    pause
}

# =============================================================================
# MAIN MENU
# =============================================================================
require_node

while :; do
    banner
    HEIGHT=$("$CLI" $RPC getblockcount 2>/dev/null || echo "?")
    echo -e "${DIM}  Node: ${NC}${BOLD}$NODE_NAME${NC}${DIM}   Chain height: ${NC}${BOLD}$HEIGHT${NC}"
    echo ""
    echo -e "${BOLD}  MENU${NC}"
    echo -e "    ${GREEN}[1]${NC} Create Wallet"
    echo -e "    ${GREEN}[2]${NC} Import Private Key"
    echo -e "    ${GREEN}[3]${NC} Start Mining  ${DIM}(CUDA GPU — SHA3-256 PQC PoW)${NC}"
    echo -e "    ${GREEN}[4]${NC} Send GRD"
    echo -e "    ${GREEN}[5]${NC} Balances & Addresses"
    echo -e "    ${GREEN}[6]${NC} Switch Node"
    echo -e "    ${GREEN}[7]${NC} Mint GRD  ${DIM}(sovereign)${NC}"
    echo -e "    ${RED}[0]${NC} Exit"
    echo ""
    read -rp "  Choice: " CHOICE
    case "$CHOICE" in
        1) action_create_wallet ;;
        2) action_import_privkey ;;
        3) action_mining ;;
        4) action_send ;;
        5) action_balance ;;
        6) action_switch_node ;;
        7) action_mint ;;
        0) echo -e "${CYAN}Goodbye.${NC}"; exit 0 ;;
        *) err "Invalid choice."; sleep 1 ;;
    esac
done
