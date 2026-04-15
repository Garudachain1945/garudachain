/**
 * Pinata IPFS Service — Tokenization Metadata Storage
 *
 * Menyimpan metadata tokenisasi (saham, SBN, aset) ke IPFS via Pinata.
 * Setiap token yang diterbitkan akan memiliki metadata permanen di IPFS
 * yang di-referensikan oleh smart contract di GarudaChain.
 */

const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_API_SECRET = import.meta.env.VITE_PINATA_API_SECRET;
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_API_URL = "https://api.pinata.cloud";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

// === TYPES ===

export interface TokenMetadata {
  name: string;
  symbol: string;
  type: "saham" | "sbn" | "grd20";
  description: string;
  image?: string; // IPFS hash of the token image
  properties: Record<string, string | number | boolean>;
}

export interface SahamMetadata extends TokenMetadata {
  type: "saham";
  properties: {
    kode: string;
    namaPerusahaan: string;
    sektor: string;
    hargaIPO: number;
    totalLot: number;
    kustodian: string;
    regulator: string;
    tanggalListing: string;
    contractAddress: string;
    standard: string;
    backing: string; // "1:1 KSEI"
  };
}

export interface SBNMetadata extends TokenMetadata {
  type: "sbn";
  properties: {
    seri: string;
    jenis: string;
    kupon: number;
    tanggalJatuhTempo: string;
    nilaiNominal: number;
    penerbit: string;
    penjamin: string;
    contractAddress: string;
    standard: string;
  };
}

export interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export interface PinnedItem {
  ipfs_pin_hash: string;
  size: number;
  date_pinned: string;
  metadata: {
    name: string;
    keyvalues: Record<string, string>;
  };
}

// === CORE FUNCTIONS ===

/**
 * Upload JSON metadata ke IPFS via Pinata
 */
export async function pinJSONToIPFS(
  metadata: TokenMetadata | SahamMetadata | SBNMetadata,
  name: string
): Promise<PinataResponse> {
  const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
    body: JSON.stringify({
      pinataContent: {
        ...metadata,
        chain: "GarudaChain",
        standard: "GRD-20",
        timestamp: new Date().toISOString(),
      },
      pinataMetadata: {
        name: `garudachain-${metadata.type}-${name}`,
        keyvalues: {
          type: metadata.type,
          symbol: metadata.symbol,
          chain: "GarudaChain",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Pinata upload failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Upload image/file ke IPFS via Pinata
 */
export async function pinFileToIPFS(
  file: File,
  name: string,
  tokenType: string
): Promise<PinataResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: `garudachain-image-${name}`,
      keyvalues: {
        type: tokenType,
        chain: "GarudaChain",
      },
    })
  );

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Pinata file upload failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get list of pinned items (tokenization metadata yang sudah di-upload)
 */
export async function getPinnedItems(filters?: {
  type?: string;
  symbol?: string;
}): Promise<PinnedItem[]> {
  const params = new URLSearchParams();
  params.set("status", "pinned");

  if (filters?.type) {
    params.set("metadata[keyvalues][type]", JSON.stringify({ value: filters.type, op: "eq" }));
  }
  if (filters?.symbol) {
    params.set("metadata[keyvalues][symbol]", JSON.stringify({ value: filters.symbol, op: "eq" }));
  }

  const response = await fetch(`${PINATA_API_URL}/data/pinList?${params}`, {
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });

  if (!response.ok) {
    throw new Error(`Pinata fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.rows;
}

/**
 * Get metadata dari IPFS by hash
 */
export async function getFromIPFS<T = TokenMetadata>(hash: string): Promise<T> {
  const response = await fetch(`${PINATA_GATEWAY}/${hash}`);
  if (!response.ok) {
    throw new Error(`IPFS fetch failed: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Unpin (hapus) dari Pinata
 */
export async function unpinFromIPFS(hash: string): Promise<void> {
  const response = await fetch(`${PINATA_API_URL}/pinning/unpin/${hash}`, {
    method: "DELETE",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });

  if (!response.ok) {
    throw new Error(`Pinata unpin failed: ${response.statusText}`);
  }
}

// === HELPER FUNCTIONS ===

/**
 * Build full IPFS URL dari hash
 */
export function getIPFSUrl(hash: string): string {
  return `${PINATA_GATEWAY}/${hash}`;
}

/**
 * Upload metadata saham tokenisasi ke IPFS
 */
export async function uploadSahamMetadata(saham: {
  kode: string;
  nama: string;
  sektor: string;
  hargaGRD: number;
  totalLot: number;
  contractAddress: string;
  imageFile?: File;
}): Promise<{ metadataHash: string; imageHash?: string }> {
  let imageHash: string | undefined;

  // Upload image dulu kalau ada
  if (saham.imageFile) {
    const imageResult = await pinFileToIPFS(saham.imageFile, saham.kode, "saham");
    imageHash = imageResult.IpfsHash;
  }

  // Upload metadata JSON
  const metadata: SahamMetadata = {
    name: saham.nama,
    symbol: saham.kode,
    type: "saham",
    description: `Token saham ${saham.nama} (${saham.kode}) yang ditokenisasi di GarudaChain. Backed 1:1 oleh saham asli di KSEI.`,
    image: imageHash ? getIPFSUrl(imageHash) : undefined,
    properties: {
      kode: saham.kode,
      namaPerusahaan: saham.nama,
      sektor: saham.sektor,
      hargaIPO: saham.hargaGRD,
      totalLot: saham.totalLot,
      kustodian: "KSEI",
      regulator: "OJK",
      tanggalListing: new Date().toISOString().split("T")[0],
      contractAddress: saham.contractAddress,
      standard: "GRD-20 Security",
      backing: "1:1 KSEI",
    },
  };

  const result = await pinJSONToIPFS(metadata, saham.kode);
  return { metadataHash: result.IpfsHash, imageHash };
}

/**
 * Upload metadata SBN tokenisasi ke IPFS
 */
export async function uploadSBNMetadata(sbn: {
  seri: string;
  jenis: string;
  kupon: number;
  jatuhTempo: string;
  nilaiNominal: number;
  contractAddress: string;
}): Promise<{ metadataHash: string }> {
  const metadata: SBNMetadata = {
    name: `${sbn.jenis} - ${sbn.seri}`,
    symbol: sbn.seri,
    type: "sbn",
    description: `Surat Berharga Negara ${sbn.seri} (${sbn.jenis}) yang ditokenisasi di GarudaChain. Dijamin oleh Pemerintah Republik Indonesia.`,
    properties: {
      seri: sbn.seri,
      jenis: sbn.jenis,
      kupon: sbn.kupon,
      tanggalJatuhTempo: sbn.jatuhTempo,
      nilaiNominal: sbn.nilaiNominal,
      penerbit: "Kemenkeu RI",
      penjamin: "Pemerintah RI",
      contractAddress: sbn.contractAddress,
      standard: "GRD-20 Bond",
    },
  };

  const result = await pinJSONToIPFS(metadata, sbn.seri);
  return { metadataHash: result.IpfsHash };
}

/**
 * Test koneksi Pinata
 */
export async function testPinataConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${PINATA_API_URL}/data/testAuthentication`, {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_API_SECRET,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
