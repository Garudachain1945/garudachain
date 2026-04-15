/**
 * GarudaChain Wallet Crypto
 * Kompatibel dengan garuda-qt desktop wallet (regtest/public mode)
 *
 * Derivasi kunci — IDENTIK dengan desktop:
 *   1. Seedphrase : 24 kata acak dari 256-kata list (sama persis)
 *   2. Private key: SHA256(seedphrase string UTF-8)
 *   3. Public key : secp256k1(private key), compressed 33 bytes
 *   4. Address    : bech32("grd", 0, HASH160(pubkey))  — P2WPKH
 *
 * Akun ke-N (N > 0): SHA256(seedphrase + "|" + N)
 */

import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { signAsync, getPublicKey } from "@noble/secp256k1";
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";

// ── Network Parameters ────────────────────────────────────────────────────
export const GARUDA_NETWORK = {
  bech32: "grd",
  wif: 239, // 0xEF — regtest
};

// ── Wordlist 256 kata (identik dengan SEED_WORDS[] di createwalletdialog.cpp)
const WORDLIST: readonly string[] = [
  "abandon","ability","able","about","above","absent","absorb","abstract",
  "absurd","abuse","access","accident","account","accuse","achieve","acid",
  "acoustic","acquire","across","act","action","actor","actress","actual",
  "adapt","add","addict","address","adjust","admit","adult","advance",
  "advice","aerobic","affair","afford","afraid","again","age","agent",
  "agree","ahead","aim","air","airport","aisle","alarm","album",
  "alcohol","alert","alien","all","alley","allow","almost","alone",
  "alpha","already","also","alter","always","amateur","amazing","among",
  "amount","amused","analyst","anchor","ancient","anger","angle","angry",
  "animal","ankle","announce","annual","another","answer","antenna","antique",
  "anxiety","any","apart","apology","appear","apple","approve","april",
  "arch","arctic","area","arena","argue","arm","armed","armor",
  "army","around","arrange","arrest","arrive","arrow","art","artefact",
  "artist","artwork","ask","aspect","assault","asset","assist","assume",
  "asthma","athlete","atom","attack","attend","attitude","attract","auction",
  "audit","august","aunt","author","auto","autumn","average","avocado",
  "avoid","awake","aware","awesome","awful","awkward","axis","baby",
  "bachelor","bacon","badge","bag","balance","balcony","ball","bamboo",
  "banana","banner","bar","barely","bargain","barrel","base","basic",
  "basket","battle","beach","bean","beauty","because","become","beef",
  "before","begin","behave","behind","believe","below","belt","bench",
  "benefit","best","betray","better","between","beyond","bicycle","bid",
  "bike","bind","biology","bird","birth","bitter","black","blade",
  "blame","blanket","blast","bleak","bless","blind","blood","blossom",
  "blow","blue","blur","blush","board","boat","body","boil",
  "bomb","bone","bonus","book","boost","border","boring","borrow",
  "boss","bottom","bounce","box","boy","bracket","brain","brand",
  "brass","brave","bread","breeze","brick","bridge","brief","bright",
  "bring","brisk","broccoli","broken","bronze","broom","brother","brown",
  "brush","bubble","buddy","budget","buffalo","build","bulb","bulk",
  "bullet","bundle","bunny","burden","burger","burst","bus","business",
  "busy","butter","buyer","buzz","cabbage","cabin","cable","cactus",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

function sha256d(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(sha256(new Uint8Array(sha256(data))));
}

function hash160(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(ripemd160(new Uint8Array(sha256(data))));
}

// ── Seedphrase — 24 kata dari 256-kata list ────────────────────────────────
// Algoritma: 24 byte random → tiap byte jadi index kata (byte % 256)
// Identik dengan GetStrongRandBytes + entropy[w] % NUM_SEED_WORDS di desktop

export function generateMnemonic(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(entropy).map(b => WORDLIST[b]).join(" ");
}

export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 24) return false;
  return words.every(w => (WORDLIST as readonly string[]).includes(w));
}

// ── Key Derivation — SHA256(phrase) identik dengan garuda-qt ─────────────

export interface DerivedKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;   // compressed, 33 bytes
  address: string;         // grd1q...
  derivationPath: string;
}

/**
 * Menurunkan kunci dari seedphrase.
 * Akun 0 : SHA256(seedphrase)             ← kompatibel 100% garuda-qt
 * Akun N : SHA256(seedphrase + "|" + N)   ← akun tambahan di extension
 */
export function deriveKey(
  mnemonic: string,
  _accountIndex = 0,
  addressIndex = 0,
): Promise<DerivedKey> {
  const enc = new TextEncoder();
  const phrase = addressIndex === 0 ? mnemonic : `${mnemonic}|${addressIndex}`;
  const privKey = new Uint8Array(sha256(enc.encode(phrase)));
  const pubKey  = new Uint8Array(getPublicKey(privKey, true)); // compressed
  const address = pubkeyToP2WPKH(pubKey);
  const path    = addressIndex === 0 ? "garuda-sha256" : `garuda-sha256|${addressIndex}`;
  return Promise.resolve({ privateKey: privKey, publicKey: pubKey, address, derivationPath: path });
}

// ── Bech32 P2WPKH Address ─────────────────────────────────────────────────

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN     = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const r: number[] = [];
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) >> 5);
  r.push(0);
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) & 31);
  return r;
}

function bech32Encode(hrp: string, data: number[]): string {
  const combined = [...data];
  const checkValues = [...hrpExpand(hrp), ...combined, 0, 0, 0, 0, 0, 0];
  const pm = polymod(checkValues) ^ 1;
  for (let i = 0; i < 6; i++) combined.push((pm >> (5 * (5 - i))) & 31);
  let result = hrp + "1";
  for (const d of combined) result += CHARSET[d];
  return result;
}

function convertBits(data: Uint8Array, from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  return out;
}

export function pubkeyToP2WPKH(pubkey: Uint8Array): string {
  const h160  = hash160(pubkey);
  const words = convertBits(h160, 8, 5, true);
  return bech32Encode(GARUDA_NETWORK.bech32, [0, ...words]);
}

// ── Bech32m (witness v2 — P2PQH, ML-DSA-87 quantum addresses) ────────────────
// Bech32m uses a different constant (0x2bc830a3) per BIP350.

const BECH32M_CONST = 0x2bc830a3;

function bech32mEncode(hrp: string, data: number[]): string {
  const combined = [...data];
  const checkValues = [...hrpExpand(hrp), ...combined, 0, 0, 0, 0, 0, 0];
  const pm = polymod(checkValues) ^ BECH32M_CONST;
  for (let i = 0; i < 6; i++) combined.push((pm >> (5 * (5 - i))) & 31);
  let result = hrp + "1";
  for (const d of combined) result += CHARSET[d];
  return result;
}

/** Encode a SHA-256(pubkey) hash as a bech32m P2PQH address (grd1z...). */
export function pubkeyToP2PQH(pubkey: Uint8Array): string {
  const pkHash = new Uint8Array(sha256(pubkey));
  const words  = convertBits(pkHash, 8, 5, true);
  return bech32mEncode(GARUDA_NETWORK.bech32, [2, ...words]); // witness v2
}

// ── ML-DSA-87 Quantum Key Derivation ─────────────────────────────────────────

export interface DerivedQuantumKey {
  publicKey: Uint8Array;   // 2592 bytes (ML-DSA-87)
  secretKey: Uint8Array;   // 4896 bytes (ML-DSA-87)
  address: string;         // grd1z... (bech32m, witness v2, P2PQH)
  publicKeyHex: string;
  secretKeyHex: string;
}

/**
 * Derive an ML-DSA-87 quantum keypair from a mnemonic.
 * Derivation: seed = SHA256(mnemonic + "|pq" [+ "|N"])
 * Identical to the mobile wallet derivation so keys are interoperable.
 */
export function deriveQuantumKey(
  mnemonic: string,
  accountIndex = 0,
): DerivedQuantumKey {
  const enc    = new TextEncoder();
  const phrase = accountIndex === 0
    ? `${mnemonic}|pq`
    : `${mnemonic}|pq|${accountIndex}`;
  const seed = new Uint8Array(sha256(enc.encode(phrase)));
  const keys = ml_dsa87.keygen(seed);
  return {
    publicKey:    keys.publicKey,
    secretKey:    keys.secretKey,
    address:      pubkeyToP2PQH(keys.publicKey),
    publicKeyHex: toHex(keys.publicKey),
    secretKeyHex: toHex(keys.secretKey),
  };
}

/**
 * Build and sign a P2PQH (witness v2, ML-DSA-87) transaction.
 * scriptCode = OP_2 <push 32> <SHA256(pubkey)>  — matches C++ CheckQuantumSignature.
 */
export async function buildAndSignQuantumTx(
  inputs: UTXO[],
  outputs: TxOutput[],
  secretKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<string> {
  const version     = writeLE32(2);
  const locktime    = writeLE32(0);
  const sigHashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);

  const outScripts = outputs.map(o => {
    if (o.opreturn !== undefined) {
      const data = fromHex(o.opreturn);
      return new Uint8Array([0x6a, data.length, ...data]);
    }
    // Determine witness version from address to build correct output script
    const sep  = o.address!.lastIndexOf("1");
    const data: number[] = [];
    for (let i = sep + 1; i < o.address!.length - 6; i++) {
      data.push(CHARSET.indexOf(o.address![i]));
    }
    const witnessVer  = data[0];
    const prog        = convertBits(new Uint8Array(data.slice(1)), 5, 8, false);
    const versionByte = witnessVer === 0 ? 0x00 : 0x50 + witnessVer;
    return new Uint8Array([versionByte, prog.length, ...prog]);
  });

  const encodedOutputs = outputs.map((o, i) =>
    cat(writeLE64(BigInt(o.value)), writeVarInt(outScripts[i].length), outScripts[i])
  );

  let allPrevouts = new Uint8Array(0);
  let allSeqs     = new Uint8Array(0);
  for (const inp of inputs) {
    allPrevouts = cat(allPrevouts, new Uint8Array(fromHex(inp.txid).reverse()), writeLE32(inp.vout));
    allSeqs     = cat(allSeqs, new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  }
  const hashPrevouts = sha256d(allPrevouts);
  const hashSequence = sha256d(allSeqs);
  const hashOutputs  = sha256d(cat(...encodedOutputs));

  const pubkeyHash = new Uint8Array(sha256(publicKey));
  const scriptCode = new Uint8Array([0x52, 0x20, ...pubkeyHash]); // OP_2 <push32> <hash>

  const witnesses: Uint8Array[][] = [];
  for (const inp of inputs) {
    const outpoint = cat(new Uint8Array(fromHex(inp.txid).reverse()), writeLE32(inp.vout));
    const sequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const value    = writeLE64(BigInt(inp.value));
    const preimage = cat(
      version, hashPrevouts, hashSequence,
      outpoint,
      writeVarInt(scriptCode.length), scriptCode,
      value, sequence,
      hashOutputs, locktime, sigHashType,
    );
    const sigHash = sha256d(preimage);
    const sig     = ml_dsa87.sign(sigHash, secretKey);
    witnesses.push([sig, publicKey]);  // stack: [signature, pubkey]
  }

  let inputsSection = writeVarInt(inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    inputsSection = cat(
      inputsSection,
      new Uint8Array(fromHex(inputs[i].txid).reverse()),
      writeLE32(inputs[i].vout),
      new Uint8Array([0x00]),
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    );
  }

  let outputsSection = writeVarInt(outputs.length);
  for (const enc of encodedOutputs) outputsSection = cat(outputsSection, enc);

  let witnessSection = new Uint8Array(0);
  for (const w of witnesses) {
    witnessSection = cat(witnessSection, writeVarInt(w.length));
    for (const item of w) witnessSection = cat(witnessSection, writeVarInt(item.length), item);
  }

  return toHex(cat(
    version,
    new Uint8Array([0x00, 0x01]),
    inputsSection,
    outputsSection,
    witnessSection,
    locktime,
  ));
}

function addressToWitnessProgram(address: string): Uint8Array {
  const sep = address.lastIndexOf("1");
  const data: number[] = [];
  for (let i = sep + 1; i < address.length - 6; i++) {
    const pos = CHARSET.indexOf(address[i]);
    if (pos < 0) throw new Error("Invalid bech32 char");
    data.push(pos);
  }
  const prog = convertBits(new Uint8Array(data.slice(1)), 5, 8, false);
  return new Uint8Array(prog);
}

function addressToScript(address: string): Uint8Array {
  const prog = addressToWitnessProgram(address);
  return new Uint8Array([0x00, prog.length, ...prog]);
}

// ── WIF Export ────────────────────────────────────────────────────────────

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(data: Uint8Array): string {
  let n = BigInt("0x" + toHex(data));
  let result = "";
  while (n > 0n) { result = B58[Number(n % 58n)] + result; n /= 58n; }
  for (const b of data) { if (b !== 0) break; result = "1" + result; }
  return result;
}

export function privateKeyToWIF(privkey: Uint8Array): string {
  const payload  = new Uint8Array([GARUDA_NETWORK.wif, ...privkey, 0x01]);
  const checksum = sha256d(payload).slice(0, 4);
  return base58Encode(new Uint8Array([...payload, ...checksum]));
}

// ── Transaction Building & Signing (SegWit P2WPKH / BIP143) ──────────────

export interface UTXO {
  txid: string;
  vout: number;
  value: number;   // satoshi
}

export interface TxOutput {
  address?: string;
  opreturn?: string;  // hex
  value: number;      // satoshi
}

function writeLE32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff; b[1] = (n >> 8) & 0xff;
  b[2] = (n >> 16) & 0xff; b[3] = (n >> 24) & 0xff;
  return b;
}

function writeLE64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function writeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function cat(...arrs: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

export async function buildAndSignTx(
  inputs: UTXO[],
  outputs: TxOutput[],
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<string> {
  const version     = writeLE32(2);
  const locktime    = writeLE32(0);
  const sigHashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);

  // Build output scripts
  const outScripts = outputs.map(o => {
    if (o.opreturn !== undefined) {
      const data = fromHex(o.opreturn);
      return new Uint8Array([0x6a, data.length, ...data]);
    }
    return addressToScript(o.address!);
  });

  const encodedOutputs = outputs.map((o, i) =>
    cat(writeLE64(BigInt(o.value)), writeVarInt(outScripts[i].length), outScripts[i])
  );

  // BIP143 commitment hashes
  let allPrevouts = new Uint8Array(0);
  let allSeqs     = new Uint8Array(0);
  for (const inp of inputs) {
    allPrevouts = cat(allPrevouts, new Uint8Array(fromHex(inp.txid).reverse()), writeLE32(inp.vout));
    allSeqs     = cat(allSeqs, new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  }
  const hashPrevouts = sha256d(allPrevouts);
  const hashSequence = sha256d(allSeqs);
  const hashOutputs  = sha256d(cat(...encodedOutputs));

  // scriptCode for P2WPKH: OP_DUP OP_HASH160 <hash160> OP_EQUALVERIFY OP_CHECKSIG
  const h160       = hash160(publicKey);
  const scriptCode = new Uint8Array([0x76, 0xa9, 0x14, ...h160, 0x88, 0xac]);

  // Sign each input (BIP143)
  const witnesses: Uint8Array[][] = [];
  for (const inp of inputs) {
    const outpoint = cat(new Uint8Array(fromHex(inp.txid).reverse()), writeLE32(inp.vout));
    const sequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const value    = writeLE64(BigInt(inp.value));

    const preimage = cat(
      version, hashPrevouts, hashSequence,
      outpoint,
      writeVarInt(scriptCode.length), scriptCode,
      value, sequence,
      hashOutputs, locktime, sigHashType,
    );
    const sigHash = sha256d(preimage);
    const sig     = await signAsync(sigHash, privateKey, { lowS: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const derSig  = new Uint8Array((sig as any).toDERRawBytes());
    witnesses.push([new Uint8Array([...derSig, 0x01]), publicKey]);
  }

  // Serialize segwit transaction
  let inputsSection = writeVarInt(inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    inputsSection = cat(
      inputsSection,
      new Uint8Array(fromHex(inputs[i].txid).reverse()),
      writeLE32(inputs[i].vout),
      new Uint8Array([0x00]),              // empty scriptSig
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    );
  }

  let outputsSection = writeVarInt(outputs.length);
  for (const enc of encodedOutputs) outputsSection = cat(outputsSection, enc);

  let witnessSection = new Uint8Array(0);
  for (const w of witnesses) {
    witnessSection = cat(witnessSection, writeVarInt(w.length));
    for (const item of w) witnessSection = cat(witnessSection, writeVarInt(item.length), item);
  }

  const rawTx = cat(
    version,
    new Uint8Array([0x00, 0x01]),  // segwit marker + flag
    inputsSection,
    outputsSection,
    witnessSection,
    locktime,
  );

  return toHex(rawTx);
}

// ── Utility ───────────────────────────────────────────────────────────────

export function formatAddress(addr: string): string {
  return addr.slice(0, 12) + "..." + addr.slice(-6);
}
