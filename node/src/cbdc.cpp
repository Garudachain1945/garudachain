// Copyright (c) 2026 GarudaChain developers
#include <cbdc.h>
#include <cbdc/authority.h>
#include <consensus/validation.h>
#include <primitives/transaction.h>
#include <script/script.h>
#include <logging.h>

namespace CBDC {

bool CheckCBDCMintInBlock(const CTransaction& tx, BlockValidationState& state)
{
    std::string errMsg;
    if (!VerifyCBDCMintSigHybrid(tx, errMsg)) {
        LogPrintf("CBDC: mint tx %s invalid: %s\n", tx.GetHash().ToString(), errMsg);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS, errMsg);
    }
    if (tx.vout.empty()) {
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS, "cbdc-mint-no-output");
    }

    // ---- Fee enforcement ----
    // CBDC_MINT must include a fee output (OP_RETURN MINT_FEE) that burns a percentage.
    // Fee = total_mint * mint_fee_ppm / 1,000,000
    // This prevents unlimited inflation without cost.
    int64_t mint_fee_ppm = GetMintFeePPM();
    int64_t total_mint = 0;
    int64_t total_fee_burned = 0;

    static const std::vector<unsigned char> FEE_MARKER = {'M', 'F', 'E', 'E'};

    for (const auto& out : tx.vout) {
        // Check for fee burn output: OP_RETURN MFEE <amount_le64>
        const CScript& s = out.scriptPubKey;
        if (s.size() >= 6 && s[0] == OP_RETURN &&
            s[1] == 4 && s[2] == 'M' && s[3] == 'F' && s[4] == 'E' && s[5] == 'E') {
            total_fee_burned += out.nValue;
            continue;
        }

        if (out.nValue <= 0) {
            return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                "cbdc-mint-nonpositive-output");
        }
        // Overflow check
        if (out.nValue > MAX_MINT_PER_TX - total_mint) {
            return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                "cbdc-mint-exceeds-per-tx-limit");
        }
        total_mint += out.nValue;
    }

    if (total_mint > MAX_MINT_PER_TX) {
        LogPrintf("CBDC: mint tx %s exceeds per-tx limit: %ld > %ld\n",
                  tx.GetHash().ToString(), total_mint, MAX_MINT_PER_TX);
        return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
            "cbdc-mint-exceeds-per-tx-limit");
    }

    // Verify fee is sufficient (fee_required = total_mint * ppm / 1000000)
    if (mint_fee_ppm > 0 && total_mint > 0) {
        // Use __int128 to avoid overflow
        __int128 required_fee = (__int128)total_mint * (__int128)mint_fee_ppm / 1000000LL;
        if (required_fee < 1) required_fee = 1; // minimum 1 satoshi fee
        if (total_fee_burned < (int64_t)required_fee) {
            LogPrintf("CBDC: mint tx %s insufficient fee: %ld < %ld (ppm=%ld)\n",
                      tx.GetHash().ToString(), total_fee_burned,
                      (int64_t)required_fee, mint_fee_ppm);
            return state.Invalid(BlockValidationResult::BLOCK_CONSENSUS,
                "cbdc-mint-insufficient-fee");
        }
    }

    return true;
}

bool IsCBDCBurnTx(const CTransaction& tx)
{
    static const std::vector<unsigned char> BURN_MARKER = {'B', 'U', 'R', 'N'};
    for (const auto& out : tx.vout) {
        const CScript& s = out.scriptPubKey;
        if (s.size() >= 6 && s[0] == OP_RETURN) {
            if (s[1] == 4 &&
                s[2] == 'B' && s[3] == 'U' && s[4] == 'R' && s[5] == 'N') {
                return true;
            }
        }
    }
    return false;
}

} // namespace CBDC
