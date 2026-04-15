#!/bin/bash
# =============================================================================
# GarudaChain 100-Wallet Parallel Test
# Tests: GRD, Orderbook stablecoin, Oracle stablecoin - all in ONE wallet
# Key fix: use SAME address per wallet for ALL operations
# =============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$BASEDIR/.env" ]; then
    set -a; . "$BASEDIR/.env"; set +a
fi
: "${GARUDA_RPC_USER_CBDC:?Set GARUDA_RPC_USER_CBDC in .env}"
: "${GARUDA_RPC_PASS_CBDC:?Set GARUDA_RPC_PASS_CBDC in .env}"
GARUDA_CLI_BIN="${GARUDA_CLI_BIN:-$BASEDIR/node/src/garuda-cli}"
GARUDA_CBDC_DATADIR="${GARUDA_CBDC_DATADIR:-$HOME/.garudachain-cbdc}"
CLI="$GARUDA_CLI_BIN -datadir=$GARUDA_CBDC_DATADIR -rpcport=19443 -rpcuser=$GARUDA_RPC_USER_CBDC -rpcpassword=$GARUDA_RPC_PASS_CBDC"
MINER_WALLET="hallo"
NUM_WALLETS=100
PARALLEL=20  # concurrent jobs

# Asset IDs
IDR_ID="acf4cdf98fe2918354bd8ae34caa458e19729a363222b9b1b752bf01c14fd3ba"
USD_ID="3f5c759976638dfaf210df41dbe2acc48391f0f3e0aa4862e53950e2d185abef"
pIDR_ID="6729493925bda6f61a00b8f12432633de6671749984e114355bb9d89bd00544f"
pUSD_ID="1eaf9b17da156f97090e209b3302367802d61859b2bc07478b7141c8b326411d"
pMYR_ID="b668d6aa037dde2d2019378b96b401b3b4154e0611f50f89f7e728ea615573ad"

ADDR_DIR="/tmp/garuda_test_addrs"
mkdir -p "$ADDR_DIR"

echo "============================================"
echo "  GarudaChain 100-Wallet Parallel Test"
echo "============================================"
echo ""

# ---- Phase 0: Get/create ONE fixed address per wallet ----
echo "[Phase 0] Getting fixed address per wallet..."
get_fixed_addr() {
    local i=$1
    local wallet="pub-$i"
    local addr_file="$ADDR_DIR/$wallet.addr"

    # If we already stored an address, reuse it
    if [ -f "$addr_file" ]; then
        cat "$addr_file"
        return
    fi

    # Get first address from wallet groupings
    local addr=$($CLI -rpcwallet="$wallet" listaddressgroupings 2>/dev/null | python3 -c "
import json,sys
try:
    g=json.load(sys.stdin)
    if g and g[0]:
        print(g[0][0][0])
    else:
        print('')
except:
    print('')
" 2>/dev/null)

    # If no grouping address, generate one and fund it to create a grouping
    if [ -z "$addr" ] || [ "$addr" = "" ]; then
        addr=$($CLI -rpcwallet="$wallet" getnewaddress 2>/dev/null)
    fi

    echo "$addr" > "$addr_file"
    echo "$addr"
}

# Get all addresses first (sequential, fast)
declare -A WALLET_ADDR
for i in $(seq 1 $NUM_WALLETS); do
    WALLET_ADDR[$i]=$(get_fixed_addr $i)
done
echo "  Got addresses for $NUM_WALLETS wallets"

# Get miner address
MINER_ADDR=$($CLI -rpcwallet=$MINER_WALLET listaddressgroupings 2>/dev/null | python3 -c "
import json,sys
g=json.load(sys.stdin)
# Find address with highest balance
best_addr=''
best_bal=0
for grp in g:
    for a in grp:
        if a[1] > best_bal:
            best_bal=a[1]
            best_addr=a[0]
print(best_addr)
" 2>/dev/null)
echo "  Miner address: $MINER_ADDR (will be used for funding)"

# ---- Phase 1: Send GRD to all wallets ----
echo ""
echo "[Phase 1] Sending GRD to 100 wallets (100 GRD each)..."
phase1_ok=0
phase1_fail=0

send_grd() {
    local i=$1
    local addr=${WALLET_ADDR[$i]}
    local result=$($CLI -rpcwallet=$MINER_WALLET sendtoaddress "$addr" 100 2>&1)
    if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
        echo "FAIL:$i:$result"
    else
        echo "OK:$i"
    fi
}
export -f send_grd
export CLI MINER_WALLET
# Need to pass WALLET_ADDR via files since export -f can't export arrays
for i in $(seq 1 $NUM_WALLETS); do
    echo "${WALLET_ADDR[$i]}" > "$ADDR_DIR/addr_$i"
done

# Run in batches
for batch_start in $(seq 1 $PARALLEL $NUM_WALLETS); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt $NUM_WALLETS ] && batch_end=$NUM_WALLETS

    pids=()
    for i in $(seq $batch_start $batch_end); do
        addr=$(cat "$ADDR_DIR/addr_$i")
        (
            result=$($CLI -rpcwallet=$MINER_WALLET sendtoaddress "$addr" 100 2>&1)
            if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                echo "FAIL" > "$ADDR_DIR/p1_$i"
            else
                echo "OK" > "$ADDR_DIR/p1_$i"
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 1 $NUM_WALLETS); do
    if [ -f "$ADDR_DIR/p1_$i" ] && [ "$(cat "$ADDR_DIR/p1_$i")" = "OK" ]; then
        ((phase1_ok++))
    else
        ((phase1_fail++))
    fi
done
echo "  Result: $phase1_ok OK, $phase1_fail FAIL"

# Generate a block to confirm
$CLI -rpcwallet=$MINER_WALLET -generate 1 > /dev/null 2>&1
sleep 1

# ---- Phase 2: GRD → IDR orderbook swap (each wallet swaps GRD to IDR) ----
echo ""
echo "[Phase 2] GRD → IDR orderbook swap (100 wallets, 10 GRD each)..."
phase2_ok=0
phase2_fail=0

for batch_start in $(seq 1 $PARALLEL $NUM_WALLETS); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt $NUM_WALLETS ] && batch_end=$NUM_WALLETS

    pids=()
    for i in $(seq $batch_start $batch_end); do
        addr=$(cat "$ADDR_DIR/addr_$i")
        (
            result=$($CLI swapgrdtostable "$IDR_ID" "$addr" 10 2>&1)
            if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                echo "FAIL:$result" > "$ADDR_DIR/p2_$i"
            else
                echo "OK" > "$ADDR_DIR/p2_$i"
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 1 $NUM_WALLETS); do
    if [ -f "$ADDR_DIR/p2_$i" ] && [[ "$(cat "$ADDR_DIR/p2_$i")" == OK* ]]; then
        ((phase2_ok++))
    else
        ((phase2_fail++))
    fi
done
echo "  Result: $phase2_ok OK, $phase2_fail FAIL"

# ---- Phase 3: IDR → pIDR arbitrage (forex_to_peg) ----
echo ""
echo "[Phase 3] IDR → pIDR arbitrage (forex_to_peg, 50 wallets)..."
phase3_ok=0
phase3_fail=0

for batch_start in $(seq 1 $PARALLEL 50); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt 50 ] && batch_end=50

    pids=()
    for i in $(seq $batch_start $batch_end); do
        addr=$(cat "$ADDR_DIR/addr_$i")
        (
            # Check IDR balance first
            bal=$($CLI getassetbalance "$addr" "$IDR_ID" 2>&1 | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
            if [ -z "$bal" ] || [ "$bal" = "0" ]; then
                echo "FAIL:no_IDR_balance" > "$ADDR_DIR/p3_$i"
            else
                # Swap half of IDR to pIDR
                swap_amt=$((bal / 2))
                if [ $swap_amt -lt 100 ]; then swap_amt=$bal; fi
                result=$($CLI swapforextopeg "forex_to_peg" "IDR" $swap_amt "$addr" 2>&1)
                if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                    echo "FAIL:$result" > "$ADDR_DIR/p3_$i"
                else
                    echo "OK" > "$ADDR_DIR/p3_$i"
                fi
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 1 50); do
    if [ -f "$ADDR_DIR/p3_$i" ] && [[ "$(cat "$ADDR_DIR/p3_$i")" == OK* ]]; then
        ((phase3_ok++))
    else
        ((phase3_fail++))
    fi
done
echo "  Result: $phase3_ok/50 OK, $phase3_fail/50 FAIL"

# ---- Phase 4: pIDR → pUSD oracle swap ----
echo ""
echo "[Phase 4] pIDR → pUSD oracle swap (25 wallets)..."
phase4_ok=0
phase4_fail=0

for batch_start in $(seq 1 $PARALLEL 25); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt 25 ] && batch_end=25

    pids=()
    for i in $(seq $batch_start $batch_end); do
        addr=$(cat "$ADDR_DIR/addr_$i")
        (
            # Check pIDR balance
            bal=$($CLI getassetbalance "$addr" "$pIDR_ID" 2>&1 | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
            if [ -z "$bal" ] || [ "$bal" = "0" ]; then
                echo "FAIL:no_pIDR" > "$ADDR_DIR/p4_$i"
            else
                # Swap half pIDR to pUSD
                swap_amt=$((bal / 2))
                if [ $swap_amt -lt 100 ]; then swap_amt=$bal; fi
                result=$($CLI swaporacle "IDR" "USD" "$swap_amt" "$addr" 2>&1)
                if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                    echo "FAIL:$result" > "$ADDR_DIR/p4_$i"
                else
                    echo "OK" > "$ADDR_DIR/p4_$i"
                fi
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 1 25); do
    if [ -f "$ADDR_DIR/p4_$i" ] && [[ "$(cat "$ADDR_DIR/p4_$i")" == OK* ]]; then
        ((phase4_ok++))
    else
        ((phase4_fail++))
    fi
done
echo "  Result: $phase4_ok/25 OK, $phase4_fail/25 FAIL"

# ---- Phase 5: pIDR → pMYR oracle swap ----
echo ""
echo "[Phase 5] pIDR → pMYR oracle swap (25 wallets, wallet 26-50)..."
phase5_ok=0
phase5_fail=0

for batch_start in $(seq 26 $PARALLEL 50); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt 50 ] && batch_end=50

    pids=()
    for i in $(seq $batch_start $batch_end); do
        addr=$(cat "$ADDR_DIR/addr_$i")
        (
            bal=$($CLI getassetbalance "$addr" "$pIDR_ID" 2>&1 | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
            if [ -z "$bal" ] || [ "$bal" = "0" ]; then
                echo "FAIL:no_pIDR" > "$ADDR_DIR/p5_$i"
            else
                swap_amt=$((bal / 2))
                if [ $swap_amt -lt 100 ]; then swap_amt=$bal; fi
                result=$($CLI swaporacle "IDR" "MYR" "$swap_amt" "$addr" 2>&1)
                if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                    echo "FAIL:$result" > "$ADDR_DIR/p5_$i"
                else
                    echo "OK" > "$ADDR_DIR/p5_$i"
                fi
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 26 50); do
    if [ -f "$ADDR_DIR/p5_$i" ] && [[ "$(cat "$ADDR_DIR/p5_$i")" == OK* ]]; then
        ((phase5_ok++))
    else
        ((phase5_fail++))
    fi
done
echo "  Result: $phase5_ok/25 OK, $phase5_fail/25 FAIL"

# ---- Phase 6: P2P transfer (wallet 1-25 send IDR to wallet 51-75) ----
echo ""
echo "[Phase 6] P2P asset transfer IDR (wallet 1-25 → wallet 51-75)..."
phase6_ok=0
phase6_fail=0

for batch_start in $(seq 1 $PARALLEL 25); do
    batch_end=$((batch_start + PARALLEL - 1))
    [ $batch_end -gt 25 ] && batch_end=25

    pids=()
    for i in $(seq $batch_start $batch_end); do
        from_addr=$(cat "$ADDR_DIR/addr_$i")
        to_idx=$((i + 50))
        to_addr=$(cat "$ADDR_DIR/addr_$to_idx")
        (
            bal=$($CLI getassetbalance "$from_addr" "$IDR_ID" 2>&1 | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
            if [ -z "$bal" ] || [ "$bal" = "0" ]; then
                echo "FAIL:no_IDR" > "$ADDR_DIR/p6_$i"
            else
                send_amt=$((bal / 4))
                if [ $send_amt -lt 10 ]; then send_amt=10; fi
                result=$($CLI transferasset "$IDR_ID" $send_amt "$from_addr" "$to_addr" 2>&1)
                if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
                    echo "FAIL:$result" > "$ADDR_DIR/p6_$i"
                else
                    echo "OK" > "$ADDR_DIR/p6_$i"
                fi
            fi
        ) &
        pids+=($!)
    done
    for pid in "${pids[@]}"; do wait $pid; done
done

for i in $(seq 1 25); do
    if [ -f "$ADDR_DIR/p6_$i" ] && [[ "$(cat "$ADDR_DIR/p6_$i")" == OK* ]]; then
        ((phase6_ok++))
    else
        ((phase6_fail++))
    fi
done
echo "  Result: $phase6_ok/25 OK, $phase6_fail/25 FAIL"

# ---- Phase 7: Verify multi-asset ownership ----
echo ""
echo "[Phase 7] Verifying multi-asset ownership (GRD + IDR + pIDR + pUSD/pMYR)..."
echo ""

verify_count=0
for i in 1 5 10 15 20 25 30 40 50; do
    addr=$(cat "$ADDR_DIR/addr_$i")
    wallet="pub-$i"

    grd_bal=$($CLI -rpcwallet="$wallet" getbalance 2>/dev/null)
    idr_bal=$($CLI getassetbalance "$addr" "$IDR_ID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
    pidr_bal=$($CLI getassetbalance "$addr" "$pIDR_ID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
    pusd_bal=$($CLI getassetbalance "$addr" "$pUSD_ID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)
    pmyr_bal=$($CLI getassetbalance "$addr" "$pMYR_ID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('balance',0))" 2>/dev/null)

    assets_held=0
    asset_list=""
    if [ "$(echo "$grd_bal > 0" | bc -l 2>/dev/null)" = "1" ]; then ((assets_held++)); asset_list+="GRD($grd_bal) "; fi
    if [ "$idr_bal" != "0" ] && [ -n "$idr_bal" ]; then ((assets_held++)); asset_list+="IDR($idr_bal) "; fi
    if [ "$pidr_bal" != "0" ] && [ -n "$pidr_bal" ]; then ((assets_held++)); asset_list+="pIDR($pidr_bal) "; fi
    if [ "$pusd_bal" != "0" ] && [ -n "$pusd_bal" ]; then ((assets_held++)); asset_list+="pUSD($pusd_bal) "; fi
    if [ "$pmyr_bal" != "0" ] && [ -n "$pmyr_bal" ]; then ((assets_held++)); asset_list+="pMYR($pmyr_bal) "; fi

    if [ $assets_held -ge 2 ]; then
        ((verify_count++))
        echo "  ✓ $wallet ($addr): $asset_list"
    else
        echo "  ✗ $wallet ($addr): $asset_list [only $assets_held assets]"
    fi
done

echo ""
echo "============================================"
echo "  FINAL SUMMARY"
echo "============================================"
echo "  Phase 1 - GRD funding:      $phase1_ok/$NUM_WALLETS"
echo "  Phase 2 - GRD→IDR swap:     $phase2_ok/$NUM_WALLETS"
echo "  Phase 3 - IDR→pIDR arb:     $phase3_ok/50"
echo "  Phase 4 - pIDR→pUSD oracle: $phase4_ok/25"
echo "  Phase 5 - pIDR→pMYR oracle: $phase5_ok/25"
echo "  Phase 6 - P2P transfer:     $phase6_ok/25"
echo "  Phase 7 - Multi-asset:      $verify_count wallets verified"
echo "============================================"
echo ""

if [ $phase2_ok -ge 90 ] && [ $phase3_ok -ge 40 ] && [ $phase4_ok -ge 20 ] && [ $phase5_ok -ge 20 ]; then
    echo ">>> TEST PASSED - System working correctly!"
else
    echo ">>> TEST NEEDS ATTENTION - Check failed phases above"
fi

# Cleanup temp files
rm -f "$ADDR_DIR"/p[0-9]*_*
