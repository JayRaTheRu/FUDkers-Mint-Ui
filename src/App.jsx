// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import {
  publicKey,
  generateSigner,
  some,
  unwrapOption,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import {
  mplCandyMachine,
  fetchCandyMachine,
  safeFetchCandyGuard,
  mintV1,
} from "@metaplex-foundation/mpl-core-candy-machine";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

// 🔁 On-chain config
import {
  RPC_ENDPOINT,
  CANDY_MACHINE_ID,
  CANDY_GUARD_ID,
  COLLECTION_MINT_ID,
  NETWORK_LABEL,
} from "./chainConfig.js";

// 🔌 Small helper import (we still have Test Tx button for now)
import { Connection, SystemProgram, Transaction } from "@solana/web3.js";

import bg from "./assets/bg.png";
import logo from "./assets/logo.png";
import showcase from "./assets/fudkers-showcase.gif";
import pack from "./assets/pack.png";

// Helper: normalize itemsAvailable/itemsRedeemed which might be number, bigint or BN-ish
function normalizeCount(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") return value;

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "object" && typeof value.toString === "function") {
    const n = Number(value.toString());
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

function App() {
  const wallet = useWallet();

  const [status, setStatus] = useState("Wallet not connected");
  const [isMinting, setIsMinting] = useState(false);
  const [lastMint, setLastMint] = useState(null); // asset address
  const [lastMintSig, setLastMintSig] = useState(null); // tx signature
  const [error, setError] = useState(null);
  const [supplyText, setSupplyText] = useState("Loading...");

  console.log("FUDKERS MINT | Network:", NETWORK_LABEL, "| RPC:", RPC_ENDPOINT);
  console.log("CM:", CANDY_MACHINE_ID, "Guard:", CANDY_GUARD_ID);

  // Keep the status line in sync with wallet connection
  useEffect(() => {
    if (wallet.connected) {
      setStatus("Wallet connected — ready to mint.");
    } else {
      setStatus("Wallet not connected.");
    }
  }, [wallet.connected]);

  // Umi instance bound to wallet + current RPC endpoint
  const umi = useMemo(() => {
    let instance = createUmi(RPC_ENDPOINT).use(mplCore()).use(mplCandyMachine());

    if (wallet && wallet.publicKey) {
      instance = instance.use(walletAdapterIdentity(wallet));
    }

    return instance;
  }, [wallet, RPC_ENDPOINT]);

  // Load CM supply / stats (with safe fallback, so no "undefined" in UI)
  async function loadCandyMachineStats() {
    try {
      const cm = await fetchCandyMachine(umi, publicKey(CANDY_MACHINE_ID));
      console.log("Candy Machine account:", cm);

      const rawAvailable =
        cm.itemsAvailable ??
        cm.data?.itemsAvailable ??
        cm.config?.itemsAvailable ??
        null;

      const rawRedeemed =
        cm.itemsRedeemed ??
        cm.data?.itemsRedeemed ??
        cm.config?.itemsRedeemed ??
        null;

      const itemsAvailable = normalizeCount(rawAvailable);
      const itemsRedeemed = normalizeCount(rawRedeemed);

      if (
        typeof itemsAvailable === "number" &&
        typeof itemsRedeemed === "number"
      ) {
        setSupplyText(`${itemsRedeemed} / ${itemsAvailable} minted`);
      } else {
        setSupplyText("Live on devnet — supply display WIP");
      }
    } catch (e) {
      console.error("Error loading candy machine stats:", e);
      setSupplyText("Supply unavailable");
    }
  }

  useEffect(() => {
    loadCandyMachineStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [umi]);

  async function handleMint() {
    setError(null);

    if (!wallet || !wallet.connected) {
      setStatus("Connect your Phantom wallet first.");
      setError("Wallet not connected.");
      return;
    }

    try {
      setIsMinting(true);
      setStatus("Building the mint…");

      // 1. Fetch Candy Machine
      const candyMachine = await fetchCandyMachine(
        umi,
        publicKey(CANDY_MACHINE_ID)
      );

      // 2. Try to fetch Candy Guard by explicit ID (if provided)
      const guardFromId =
        CANDY_GUARD_ID && CANDY_GUARD_ID !== ""
          ? await safeFetchCandyGuard(umi, publicKey(CANDY_GUARD_ID))
          : null;

      // 3. Also try via the CM mintAuthority
      const guardFromCm = await safeFetchCandyGuard(
        umi,
        candyMachine.mintAuthority
      );

      console.log("Candy Machine mintAuthority:", String(candyMachine.mintAuthority));
      console.log("Guard from ID:", guardFromId);
      console.log("Guard from CM:", guardFromCm);

      const candyGuard = guardFromId ?? guardFromCm;

      if (!candyGuard) {
        throw new Error(
          "Candy Guard account not found from provided ID or CM mint authority."
        );
      }

      // 4. Build mintArgs from guards (SolPayment + MintLimit etc.)
      let mintArgs = {};

      const solPayment = unwrapOption(candyGuard.guards.solPayment);
      if (solPayment) {
        mintArgs.solPayment = some({
          destination: solPayment.destination,
        });
      }

      const mintLimit = unwrapOption(candyGuard.guards.mintLimit);
      if (mintLimit) {
        mintArgs.mintLimit = some({ id: mintLimit.id });
      }

      const MINT_GROUP = null; // e.g. "public"

      // 5. Generate a new Core asset to be minted
      const asset = generateSigner(umi);

      setStatus("Sending transaction…");

      // 6. Call mintV1 and capture the *signature* in a string-safe way
      const umiResult = await mintV1(umi, {
        candyMachine: candyMachine.publicKey,
        collection: candyMachine.collectionMint ?? publicKey(COLLECTION_MINT_ID),
        asset,
        candyGuard: candyGuard.publicKey,
        mintArgs,
        ...(MINT_GROUP ? { group: MINT_GROUP } : {}),
      }).sendAndConfirm(umi);

      console.log("Mint result from umi:", umiResult);

      let sigStr = null;
      if (typeof umiResult === "string") {
        sigStr = umiResult;
      } else if (
        typeof umiResult === "object" &&
        umiResult !== null &&
        "signature" in umiResult
      ) {
        sigStr = umiResult.signature;
      } else {
        // last resort: stringify
        sigStr = String(umiResult);
      }

      console.log("Mint tx signature (normalized):", sigStr);

      const mintAddress = String(asset.publicKey);

      setLastMint(mintAddress);
      setLastMintSig(sigStr);
      setStatus("Mint success.");
      loadCandyMachineStats();
    } catch (e) {
      console.error("Mint error RAW object:", e);
      console.error("Mint error CAUSE:", e?.cause);

      if (e?.message?.includes("User rejected")) {
        setStatus("Mint cancelled.");
        setError("You cancelled the transaction in Phantom.");
      } else {
        setStatus("Mint failed.");
        setError(e?.message || "Something went wrong while minting.");
      }
    } finally {
      setIsMinting(false);
    }
  }

  // 🧪 Test helper – devnet only. On mainnet, we can turn this into a TIP button.
  async function handleTestTx() {
    setError(null);

    if (!wallet || !wallet.connected || !wallet.publicKey) {
      setStatus("Connect your Phantom wallet first (for test tx).");
      return;
    }

    try {
      setStatus("Building test transaction…");

      const connection = new Connection(RPC_ENDPOINT, {
        commitment: "confirmed",
      });

      const { blockhash } = await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash: blockhash,
      }).add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: wallet.publicKey, // send to self
          lamports: 1, // 1 lamport = smallest non-zero
        })
      );

      console.log("Test tx (before send):", tx);

      const sig = await wallet.sendTransaction(tx, connection);
      console.log("Test tx signature:", sig);

      setStatus("Test tx sent: " + sig);
    } catch (e) {
      console.error("Test tx error RAW:", e);
      console.error("Test tx error cause:", e?.cause);
      setStatus("Test tx failed.");
      setError(e?.message || "Test tx error");
    }
  }

  const shortAddress = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey
        .toBase58()
        .slice(-4)}`
    : null;

  return (
    <div
      className="mint-page"
      style={{ backgroundImage: `url(${bg})` }}
    >
      <div className="mint-shell">
        {/* LEFT SIDE – Brand + Story */}
        <div className="mint-left">
          <div className="mint-logo">
            <img
              src={logo}
              alt="Neighborhood FUDkers"
              style={{ height: 56, width: "auto" }}
            />
            <div>
              <div className="mint-tagline">
                Fortitude • Understanding • Determination
              </div>
              <div className="mint-heading">
                Neighborhood <span>FUDkers</span>
              </div>
            </div>
          </div>

          <p className="mint-copy">
            51 one-of-one boom-bap misfits from the Neighborhood. No
            moon-lambo fantasies. No gatekeeping. Just raw IP you can flip,
            sample, print, or press to vinyl. The token is the ticket –
            proof you were here when the block was still underground.
          </p>

          <div className="mint-pill-row">
            <div className="mint-pill">51 × 1-of-1 FUDkers</div>
            <div className="mint-pill">Core Candy Machine v2.9</div>
            <div className="mint-pill">{NETWORK_LABEL} • Solana</div>
          </div>

          <div className="mint-stat-row">
            <div className="mint-stat">
              <div className="mint-stat-label">Mint Status</div>
              <div className="mint-stat-value">{supplyText}</div>
            </div>
            <div className="mint-stat">
              <div className="mint-stat-label">Wallet</div>
              <div className="mint-stat-value">
                {shortAddress || "Not connected"}
              </div>
            </div>
          </div>

          <div className="mint-status">
            <span>{status}</span>
          </div>

          <div className="mint-showcase">
            <img
              src={showcase}
              alt="FUDkers Showcase"
              className="mint-showcase-img"
            />
          </div>

          <div className="mint-footer">
            FUD or fold. Kick it in the Neighborhood, or stay in the matrix.
          </div>
        </div>

        {/* RIGHT SIDE – Wallet + Mint Pack */}
        <div className="mint-right">
          <div>
            <div className="mint-wallet-row">
              <div className="mint-wallet-label">Wallet</div>
              <WalletMultiButton />
            </div>
            {error && <div className="mint-alert">{error}</div>}
          </div>

          <div className="mint-pack-frame">
            <div className="mint-pack-label">
              Pack Rip • <span>Random FUDker</span>
            </div>
            <img
              src={pack}
              alt="FUDkers Pack"
              style={{
                width: 220,
                maxWidth: "70%",
                height: "auto",
                objectFit: "contain",
              }}
            />
            <button
              className="mint-button-primary"
              disabled={isMinting || !wallet.connected}
              onClick={handleMint}
            >
              {isMinting ? "Minting…" : "Mint a FUDker"}
            </button>

            {/* Devnet-only helper button for now */}
            <button
              className="mint-button-primary"
              style={{ marginTop: 8, opacity: 0.8 }}
              disabled={!wallet.connected}
              onClick={handleTestTx}
            >
              Test Wallet Tx
            </button>

            {!wallet.connected && (
              <div className="mint-status" style={{ marginTop: 6 }}>
                Connect Phantom to rip a pack.
              </div>
            )}
          </div>

          {lastMint && (
            <div className="mint-success">
              <div className="mint-success-heading">Latest mint</div>

              <div className="mint-success-row">
                <div className="mint-success-label">Asset</div>
                <div className="mint-success-code">{lastMint}</div>
              </div>

              {lastMintSig && (
                <div className="mint-success-row">
                  <div className="mint-success-label">Tx</div>
                  <a
                    href={`https://explorer.solana.com/tx/${lastMintSig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="mint-success-code"
                    style={{
                      color: "#f5a01f",
                      textDecoration: "underline",
                    }}
                  >
                    View on Solana Explorer
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;


