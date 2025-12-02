// src/chainConfig.js

// 🔁 For now we test on devnet
export const ENV = "devnet"; // later you'll flip this to "mainnet"

// We’ll use Solscan for all on-chain links (kept for future use if needed)
const SOLSCAN_BASE = "https://solscan.io";

const DEVNET_CONFIG = {
  // ✅ Use Solana public devnet RPC for now
  RPC_ENDPOINT: "https://api.devnet.solana.com",

  // ✅ CM #2 DEVNET
  CANDY_MACHINE_ID: "9aw2qvPDzZmXbwiGY61k355ngcg5mv1pqVtncMUi3osw",
  CANDY_GUARD_ID: "HWdNG5XSZzkyih6X68cZkH7PHUR5mEYjWNBb3NpsSmc9",
  COLLECTION_MINT_ID: "5cBLXmfyUEptGs79Xcb9jvoCjHRByLZ7rs7xSpf8nF9",

  // Explorer (optional)
  EXPLORER_BASE_URL: SOLSCAN_BASE,
  EXPLORER_CLUSTER_SUFFIX: "?cluster=devnet",
};

const MAINNET_CONFIG = {
  // For later: we’ll swap this for your Cloudflare/mainnet RPC
  RPC_ENDPOINT:
    import.meta.env.VITE_RPC_ENDPOINT ||
    "https://api.mainnet-beta.solana.com",

  // Placeholder mainnet values for now
  CANDY_MACHINE_ID: "2Qt4wgrU2nfFcxKoyhyUJzrCGeDVtpeNZsREG7DfR1eX",
  CANDY_GUARD_ID: "H7GN9ghtuzezF3k3nbf6xqFJhzVzs8oZKUnac9B2jtbt",
  COLLECTION_MINT_ID: "Bj9KkjNbps48cFyYjFigcb4g2jpA7y7SbFEnRw79MGJR",

  EXPLORER_BASE_URL: SOLSCAN_BASE,
  EXPLORER_CLUSTER_SUFFIX: "", // mainnet is default
};

const ACTIVE_CONFIG = ENV === "devnet" ? DEVNET_CONFIG : MAINNET_CONFIG;

export const RPC_ENDPOINT = ACTIVE_CONFIG.RPC_ENDPOINT;
export const CANDY_MACHINE_ID = ACTIVE_CONFIG.CANDY_MACHINE_ID;
export const CANDY_GUARD_ID = ACTIVE_CONFIG.CANDY_GUARD_ID;
export const COLLECTION_MINT_ID = ACTIVE_CONFIG.COLLECTION_MINT_ID;
export const EXPLORER_BASE_URL = ACTIVE_CONFIG.EXPLORER_BASE_URL;
export const EXPLORER_CLUSTER_SUFFIX = ACTIVE_CONFIG.EXPLORER_CLUSTER_SUFFIX;

// UI label
export const NETWORK_LABEL =
  ENV === "devnet"
    ? "Devnet"
    : ENV === "mainnet"
    ? "Mainnet"
    : "Custom RPC";

// Mint price (must match guard solPayment lamports: 1 SOL)
export const MINT_PRICE_SOL = 1;
