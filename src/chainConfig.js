// src/chainConfig.js

// 🔁 For now we test on devnet
export const ENV = "devnet"; // later you'll flip this to "mainnet"

const DEVNET_CONFIG = {
  // ✅ Your Helius devnet RPC
  RPC_ENDPOINT:
    "https://devnet.helius-rpc.com/?api-key=af2e60ed-0422-4853-bd1c-7e6c20cf66b6",

  // ✅ Your real DEVNET pubkeys
  CANDY_MACHINE_ID: "5K9nyCF86b9EJWk8ojQa8Xo4WGGRLE4M88o59f1LsyyF",
  CANDY_GUARD_ID: "Fg39iKZcLVZzZcdJmRws9B4WnGMjEAsrM8XvjE5yT3KJ",
  COLLECTION_MINT_ID: "FoE9dyvAAJTGMCXgnWxAVyvMc2oBP8FEthfF59Mr3grv",
};

const MAINNET_CONFIG = {
  // For later: we’ll swap this for your Cloudflare RPC
  RPC_ENDPOINT:
    "https://devnet.helius-rpc.com/?api-key=af2e60ed-0422-4853-bd1c-7e6c20cf66b6",

  CANDY_MACHINE_ID: "2Qt4wgrU2nfFcxKoyhyUJzrCGeDVtpeNZsREG7DfR1eX",
  CANDY_GUARD_ID: "H7GN9ghtuzezF3k3nbf6xqFJhzVzs8oZKUnac9B2jtbt",
  COLLECTION_MINT_ID: "Bj9KkjNbps48cFyYjFigcb4g2jpA7y7SbFEnRw79MGJR",
};

const ACTIVE_CONFIG = ENV === "devnet" ? DEVNET_CONFIG : MAINNET_CONFIG;

export const RPC_ENDPOINT = ACTIVE_CONFIG.RPC_ENDPOINT;
export const CANDY_MACHINE_ID = ACTIVE_CONFIG.CANDY_MACHINE_ID;
export const CANDY_GUARD_ID = ACTIVE_CONFIG.CANDY_GUARD_ID;
export const COLLECTION_MINT_ID = ACTIVE_CONFIG.COLLECTION_MINT_ID;

export const NETWORK_LABEL =
  ENV === "devnet"
    ? "Devnet"
    : ENV === "mainnet"
    ? "Mainnet"
    : "Custom RPC";
