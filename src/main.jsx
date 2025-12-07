// src/main.jsx
import { Buffer } from "buffer";

// Make Buffer available globally for any libs that expect it
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

// 🔁 Use the SAME config as Umi / Candy Machine
import { RPC_ENDPOINT, NETWORK_LABEL } from "./chainConfig.js";

const endpoint = RPC_ENDPOINT;

// With Phantom as a Standard wallet, we don't need to manually add PhantomWalletAdapter.
// WalletProvider will pick up Phantom from the browser extension.
const wallets = []; // can stay empty; Standard wallets are auto-discovered

console.log(
  "Wallet ConnectionProvider | Network:",
  NETWORK_LABEL,
  "| RPC:",
  endpoint
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
