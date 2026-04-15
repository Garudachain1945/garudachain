/**
 * Pure TypeScript QR Code generator — byte mode, ECC Level M, versions 1-7
 * ISO/IEC 18004 compliant. No external dependencies.
 */

// ── GF(256) arithmetic ────────────────────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];

function rsGenPoly(deg: number): number[] {
  let p = [1];
  for (let i = 0; i < deg; i++) {
    const r: number[] = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) {
      r[j] ^= p[j];
      r[j + 1] ^= gfMul(p[j], GF_EXP[i]);
    }
    p = r;
  }
  return p;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenPoly(ecLen);
  const rem = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = rem[i];
    if (c !== 0)
      for (let j = 1; j < gen.length; j++)
        rem[i + j] ^= gfMul(gen[j], c);
  }
  return rem.slice(data.length);
}

// ── QR code tables (ECC Level M only) ────────────────────────────────────────

interface ECInfo { ec: number; groups: [number, number][] }

const ECCM: (ECInfo | null)[] = [
  null,
  { ec: 10, groups: [[1, 16]] }, // v1 data=16
  { ec: 16, groups: [[1, 28]] }, // v2 data=28
  { ec: 26, groups: [[1, 44]] }, // v3 data=44
  { ec: 18, groups: [[2, 32]] }, // v4 data=64
  { ec: 24, groups: [[2, 43]] }, // v5 data=86
  { ec: 16, groups: [[4, 27]] }, // v6 data=108
  { ec: 18, groups: [[4, 31]] }, // v7 data=124
];

// Alignment pattern center coordinates per version
const ALIGNCTR: number[][] = [[], [], [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38]];

// Remainder bits appended after final codewords
const REMBITS = [0, 0, 7, 7, 7, 7, 7, 0];

// Format info (15 bits) for ECC Level M (indicator=00), masks 0-7 (precomputed)
const FMTM = [
  0b101010000010010,
  0b101000100100101,
  0b101111001111100,
  0b101101101001011,
  0b100010111111001,
  0b100000011001110,
  0b100111110010111,
  0b100101010100000,
];

// ── Matrix helpers ────────────────────────────────────────────────────────────

function mkMat(n: number): Uint8Array[] {
  return Array.from({ length: n }, () => new Uint8Array(n));
}

function placeFinder(mat: Uint8Array[], row: number, col: number) {
  const n = mat.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r, mc = col + c;
      if (mr < 0 || mr >= n || mc < 0 || mc >= n) continue;
      mat[mr][mc] =
        r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4))
          ? 1 : 0;
    }
  }
}

function placeAlign(mat: Uint8Array[], row: number, col: number) {
  for (let r = -2; r <= 2; r++)
    for (let c = -2; c <= 2; c++)
      mat[row + r][col + c] =
        r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0) ? 1 : 0;
}

// Returns true if (row,col) falls inside a finder+separator reserved corner
function inFinderArea(r: number, c: number, n: number) {
  return (r <= 8 && c <= 8) || (r <= 8 && c >= n - 8) || (r >= n - 8 && c <= 8);
}

function placeFormat(mat: Uint8Array[], mask: number, ver: number) {
  const b = FMTM[mask];
  const n = mat.length;
  // First copy around top-left finder
  for (let i = 0; i <= 5; i++) mat[8][i] = (b >> (14 - i)) & 1;
  mat[8][7] = (b >> 8) & 1; // col 6 is timing — skip
  mat[8][8] = (b >> 7) & 1;
  mat[7][8] = (b >> 6) & 1; // row 6 is timing — skip
  for (let i = 5; i >= 0; i--) mat[i][8] = (b >> i) & 1;
  // Second copy: top-right row + bottom-left col
  for (let i = 0; i <= 7; i++) mat[8][n - 1 - i] = (b >> i) & 1;
  for (let i = 0; i <= 6; i++) mat[n - 7 + i][8] = (b >> (14 - i)) & 1;
  // Dark module (always 1)
  mat[4 * ver + 9][8] = 1;
}

// ── Mask penalty evaluation ───────────────────────────────────────────────────

function penaltyScore(m: Uint8Array[]): number {
  const n = m.length;
  let s = 0;

  // N1: 5+ consecutive same-color in row/col
  for (let r = 0; r < n; r++) {
    let run = 1, prev = m[r][0];
    for (let c = 1; c < n; c++) {
      if (m[r][c] === prev) { if (++run === 5) s += 3; else if (run > 5) s++; }
      else { run = 1; prev = m[r][c]; }
    }
  }
  for (let c = 0; c < n; c++) {
    let run = 1, prev = m[0][c];
    for (let r = 1; r < n; r++) {
      if (m[r][c] === prev) { if (++run === 5) s += 3; else if (run > 5) s++; }
      else { run = 1; prev = m[r][c]; }
    }
  }

  // N2: 2×2 blocks of same color
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r+1][c] && m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c+1])
        s += 3;

  // N4: dark module ratio deviation
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const k = Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
  s += k * 10;

  return s;
}

// ── Main QR generator ─────────────────────────────────────────────────────────

export function generateQR(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const len = bytes.length;

  // Select minimum version
  const need = Math.ceil((4 + 8 + 8 * len + 4) / 8);
  let ver = 1;
  while (ver < ECCM.length - 1) {
    const info = ECCM[ver]!;
    if (info.groups.reduce((s, [n, d]) => s + n * d, 0) >= need) break;
    ver++;
  }

  const info = ECCM[ver]!;
  const cap = info.groups.reduce((s, [n, d]) => s + n * d, 0);
  const size = 17 + 4 * ver;
  const mat = mkMat(size);
  const res = mkMat(size); // reserved (function) modules

  // ── Place finder patterns + reserve areas ───────────────────────────────
  placeFinder(mat, 0, 0);
  placeFinder(mat, 0, size - 7);
  placeFinder(mat, size - 7, 0);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) res[r][c] = 1;
  for (let r = 0; r < 9; r++) for (let c = size - 8; c < size; c++) res[r][c] = 1;
  for (let r = size - 8; r < size; r++) for (let c = 0; c < 9; c++) res[r][c] = 1;

  // ── Timing patterns ─────────────────────────────────────────────────────
  for (let i = 8; i < size - 8; i++) {
    mat[6][i] = i % 2 === 0 ? 1 : 0;
    mat[i][6] = i % 2 === 0 ? 1 : 0;
    res[6][i] = 1;
    res[i][6] = 1;
  }

  // ── Alignment patterns ──────────────────────────────────────────────────
  const ap = ALIGNCTR[ver] ?? [];
  for (let ai = 0; ai < ap.length; ai++)
    for (let aj = 0; aj < ap.length; aj++) {
      const cy = ap[ai], cx = ap[aj];
      if (inFinderArea(cy, cx, size)) continue;
      placeAlign(mat, cy, cx);
      for (let r = cy - 2; r <= cy + 2; r++)
        for (let c = cx - 2; c <= cx + 2; c++)
          res[r][c] = 1;
    }

  // Dark module
  mat[4 * ver + 9][8] = 1;
  res[4 * ver + 9][8] = 1;

  // ── Data encoding ────────────────────────────────────────────────────────
  const bits: number[] = [0, 1, 0, 0]; // mode = byte
  for (let i = 7; i >= 0; i--) bits.push((len >> i) & 1); // char count
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  const maxBits = cap * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0); // terminator
  while (bits.length % 8) bits.push(0); // byte align
  // Padding codewords: 0xEC, 0x11, 0xEC, 0x11, ...
  for (let pi = 0; bits.length < maxBits; pi++) {
    const pad = pi % 2 === 0 ? 0xEC : 0x11;
    for (let i = 7; i >= 0; i--) bits.push((pad >> i) & 1);
  }

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  // ── Error correction + interleaving ──────────────────────────────────────
  const blocks: { d: number[]; e: number[] }[] = [];
  let di = 0;
  for (const [nb, nd] of info.groups)
    for (let b = 0; b < nb; b++) {
      const d = dataBytes.slice(di, di + nd);
      blocks.push({ d, e: rsEncode(d, info.ec) });
      di += nd;
    }

  const fb: number[] = [];
  const maxD = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxD; i++)
    for (const blk of blocks) if (i < blk.d.length) fb.push(blk.d[i]);
  const maxE = blocks[0].e.length;
  for (let i = 0; i < maxE; i++)
    for (const blk of blocks) fb.push(blk.e[i]);

  const finalBits: number[] = [];
  for (const b of fb) for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
  for (let i = 0; i < (REMBITS[ver] ?? 0); i++) finalBits.push(0);

  // ── Place data bits in matrix ────────────────────────────────────────────
  let bi = 0, upward = true, col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // skip timing column
    for (let ri = 0; ri < size; ri++) {
      const r = upward ? size - 1 - ri : ri;
      for (let cd = 0; cd < 2; cd++) {
        const c = col - cd;
        if (!res[r][c]) mat[r][c] = finalBits[bi++] ?? 0;
      }
    }
    col -= 2;
    upward = !upward;
  }

  // ── Mask evaluation ──────────────────────────────────────────────────────
  const maskFns: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r, _) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
  ];

  let bestMask = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = mkMat(size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        m[r][c] = res[r][c] ? mat[r][c] : mat[r][c] ^ (maskFns[mask](r, c) ? 1 : 0);
    const sc = penaltyScore(m);
    if (sc < bestScore) { bestScore = sc; bestMask = mask; }
  }

  // Apply best mask to data modules
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!res[r][c] && maskFns[bestMask](r, c)) mat[r][c] ^= 1;

  // Place format info
  placeFormat(mat, bestMask, ver);

  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => mat[r][c] === 1)
  );
}
