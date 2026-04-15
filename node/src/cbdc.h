// Copyright (c) 2026 GarudaChain developers
// CBDC block-level validation
#pragma once

#include <consensus/validation.h>
#include <primitives/transaction.h>

class CBlock;
class CCoinsViewCache;

namespace CBDC {

// Validate CBDC_MINT tx inside a block.
// Returns true if valid, false + fills state if invalid.
bool CheckCBDCMintInBlock(const CTransaction& tx, BlockValidationState& state);

// Returns true if the tx is a CBDC_BURN (OP_RETURN with CBDC burn marker).
bool IsCBDCBurnTx(const CTransaction& tx);

} // namespace CBDC
