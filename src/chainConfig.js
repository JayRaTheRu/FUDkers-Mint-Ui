// src/chainConfig.js

export const ENV = "mainnet"; // we are on mainnet

const SOLSCAN_BASE = "https://solscan.io";

const FALLBACK_MAINNET_RPC =
  "https://mainnet.helius-rpc.com/?api-key=af2e60ed-0422-4853-bd1c-7e6c20cf66b6";

function resolveRpcEndpoint() {
  const envEndpoint = import.meta.env.VITE_RPC_ENDPOINT;

  if (
    typeof envEndpoint === "string" &&
    envEndpoint.trim().toLowerCase().startsWith("http")
  ) {
    return envEndpoint.trim();
  }

  return FALLBACK_MAINNET_RPC;
}

const DEVNET_CONFIG = {
  RPC_ENDPOINT: "https://api.devnet.solana.com",
  CANDY_MACHINE_ID: "9aw2qvPDzZmXbwiGY61k355ngcg5mv1pqVtncMUi3osw",
  CANDY_GUARD_ID: "HWdNG5XSZzkyih6X68cZkH7PHUR5mEYjWNBb3NpsSmc9",
  COLLECTION_MINT_ID: "5cBLXmfyUEptGs79Xcb9jvoCjHRByLZ7rs7xSpf8nF9",
  EXPLORER_BASE_URL: SOLSCAN_BASE,
  EXPLORER_CLUSTER_SUFFIX: "?cluster=devnet",
};

const MAINNET_CONFIG = {
  // 🔒 Uses VITE_RPC_ENDPOINT if valid, else falls back to Helius
  RPC_ENDPOINT: resolveRpcEndpoint(),

  // ✅ MAINNET Candy Machine #5 + Guard + Collection
  CANDY_MACHINE_ID: "EFrJRNxg14rRjezeEaVvVbvach5cwX3d2kfBtjdyFh9d",
  CANDY_GUARD_ID: "26LNbWTKYj1F9x8Zuss91qAzimVFv8M4hqutAjaXbivQ",
  COLLECTION_MINT_ID: "Eb7mEMNK4hNQVTAkCH7nbjkiX7JdstSFS9WcjGqiLsgA",

  EXPLORER_BASE_URL: SOLSCAN_BASE,
  EXPLORER_CLUSTER_SUFFIX: "", // mainnet
};

const ACTIVE_CONFIG = ENV === "devnet" ? DEVNET_CONFIG : MAINNET_CONFIG;

export const RPC_ENDPOINT = ACTIVE_CONFIG.RPC_ENDPOINT;
export const CANDY_MACHINE_ID = ACTIVE_CONFIG.CANDY_MACHINE_ID;
export const CANDY_GUARD_ID = ACTIVE_CONFIG.CANDY_GUARD_ID;
export const COLLECTION_MINT_ID = ACTIVE_CONFIG.COLLECTION_MINT_ID;
export const EXPLORER_BASE_URL = ACTIVE_CONFIG.EXPLORER_BASE_URL;
export const EXPLORER_CLUSTER_SUFFIX = ACTIVE_CONFIG.EXPLORER_CLUSTER_SUFFIX;

export const NETWORK_LABEL =
  ENV === "devnet"
    ? "Devnet"
    : ENV === "mainnet"
    ? "Mainnet"
    : "Custom RPC";

// Must match guard: ◎1
export const MINT_PRICE_SOL = 1;

// This must match the `destination` shown in `sugar guard show`
export const SOL_PAYMENT_DESTINATION =
  "6WbBX58cHCcuhR6BPpCDXm5eRULuxwxes7jwEodTWtHc";
