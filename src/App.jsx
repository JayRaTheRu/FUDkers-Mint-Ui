// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { Connection, SystemProgram, Transaction, PublicKey } from "@solana/web3.js";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  publicKey,
  generateSigner,
  some,
  transactionBuilder,
} from "@metaplex-foundation/umi";

import {
  mplCandyMachine,
  fetchCandyMachine,
  safeFetchCandyGuard,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";

import {
  mplTokenMetadata,
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit } from "@metaplex-foundation/mpl-toolbox";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

import {
  ENV,
  RPC_ENDPOINT,
  CANDY_MACHINE_ID,
  CANDY_GUARD_ID,
  COLLECTION_MINT_ID,
  NETWORK_LABEL,
  MINT_PRICE_SOL,
} from "./chainConfig.js";

import "./App.css"; // ✅ hook up the CSS

import bg from "./assets/bg.png";
import logo from "./assets/logo.png";
import showcase from "./assets/fudkers-showcase.gif";
import pack from "./assets/pack.png";
import jayra from "./assets/jayra.png";

// 🔄 Load all transparent FUDker PNGs from assets/fudkers-pfps
const fudkerImages = import.meta.glob("./assets/fudkers-pfps/*.png", {
  eager: true,
  import: "default",
});

// Desired FUDker order (0–50) – MUST match file basenames exactly
const FUDKER_ORDER = [
  "JayRaTheRu",
  "Viny L",
  "Bloo",
  "LouCypher",
  "KiETH",
  "Krypta",
  "Pape",
  "Pau Lee",
  "Ayuh",
  "YuDoo YuGee",
  "FunKer",
  "DJenn",
  "OiNK",
  "DEXTER",
  "DeXi",
  "FARGON",
  "TeeAye",
  "JeeteR",
  "LuCia",
  "Eva",
  "ReKt",
  "GiGi",
  "JoeJo",
  "GEM",
  "BlockChin",
  "DOOKS",
  "Aye Eye",
  "KodeR",
  "Ethster",
  "ERupt",
  "DeePloy",
  "MiLLY",
  "TRiLLY",
  "SWAPZ",
  "Slana",
  "Meemz",
  "DRiP",
  "DRoP",
  "LiLLY",
  "PulseR",
  "Peenk",
  "DEFY",
  "OG",
  "Mellow",
  "PUMPY",
  "DUMPY",
  "HiGHR",
  "BRiDGEiT",
  "RicHie",
  "BOO",
  "WEB3R",
];

// Map imports → { name, src } and then order by FUDKER_ORDER
const FUDKER_PFPS_UNORDERED = Object.entries(fudkerImages).map(
  ([path, src]) => {
    const filename = path.split("/").pop() || "";
    const name = filename.replace(/\.[^/.]+$/, ""); // strip extension
    return { name, src };
  }
);

const FUDKER_PFPS = FUDKER_ORDER.map((name) =>
  FUDKER_PFPS_UNORDERED.find((f) => f.name === name)
).filter(Boolean);

// 👉 Creator / SOL payment destination (must match candy guard solPayment destination)
const CREATOR_WALLET = "6WbBX58cHCcuhR6BPpCDXm5eRULuxwxes7jwEodTWtHc";

// 👉 Site version (bump this every time you deploy / push)
const SITE_VERSION = "v1.4";

// Local storage key for CM #2 mint history
const MINT_HISTORY_STORAGE_KEY = "fudkers_cm2_mint_history_v1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🔍 Helper: normalize traits from NFT JSON metadata
const parseTraits = (json) => {
  if (!json || !Array.isArray(json.attributes)) return [];
  return json.attributes.map((attr, index) => ({
    id: index,
    trait_type: attr.trait_type || attr.traitType || attr.type || "Trait",
    value: attr.value || attr.val || "",
  }));
};

function App() {
  const wallet = useWallet();

  // UIs + on-chain state
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState(null);
  const [candyGuard, setCandyGuard] = useState(null);
  const [error, setError] = useState(null);

  // Mint result state (for “You just minted …” panel)
  const [lastMintAddress, setLastMintAddress] = useState(null);
  const [lastMintMetadata, setLastMintMetadata] = useState(null);

  // Wallet gallery state (for CM #2 – local history)
  const [walletLookup, setWalletLookup] = useState("");
  const [walletNfts, setWalletNfts] = useState([]);
  const [walletNftDetails, setWalletNftDetails] = useState({});
  const [walletLookupLoading, setWalletLookupLoading] = useState(false);
  const [walletLookupError, setWalletLookupError] = useState(null);

  // Creator tip state
  const [tipAmountSol, setTipAmountSol] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState(null);
  const [tipSuccess, setTipSuccess] = useState(null);

  // Umi client (Metaplex – TM candy machine v3 + token metadata)
  const umi = useMemo(() => {
    return createUmi(RPC_ENDPOINT)
      .use(mplCandyMachine())
      .use(mplTokenMetadata());
  }, []);

  // Attach wallet identity to Umi when wallet changes
  useEffect(() => {
    if (!wallet || !wallet.publicKey) return;
    umi.use(walletAdapterIdentity(wallet));
  }, [umi, wallet]);

  // Helper: fetch metadata for a given mint (single attempt)
  async function fetchMetadataForMintAddress(mintAddress) {
    console.log("Fetching metadata for mint:", mintAddress);

    const asset = await fetchDigitalAsset(umi, publicKey(mintAddress));
    const uri = asset.metadata.uri;
    console.log("On-chain metadata URI:", uri);

    let json = null;

    if (uri && uri.length > 0) {
      try {
        const res = await fetch(uri);
        if (!res.ok) {
          console.warn(
            `Off-chain metadata fetch failed (status ${res.status}) for ${uri}`
          );
        } else {
          json = await res.json();
        }
      } catch (offchainErr) {
        console.warn(
          `Off-chain metadata fetch error for ${uri}:`,
          offchainErr
        );
      }
    }

    const name =
      (json && json.name) || asset.metadata.name || "FUDker";

    const imageUrl =
      (json &&
        (json.image || json.imageUrl || json.imageURL || null)) ||
      null;

    const animationUrl =
      (json &&
        (json.animation_url ||
          json.animationURL ||
          json.animation ||
          null)) ||
      null;

    const traits = parseTraits(json);

    return { name, imageUrl, animationUrl, traits };
  }

  // 🔁 Wrapper: retry metadata until media/traits show (or we give up)
  async function loadMintMetadataWithRetry(mintAddress) {
    let lastError = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`Metadata load attempt ${attempt} for`, mintAddress);
        const meta = await fetchMetadataForMintAddress(mintAddress);

        const hasMedia =
          !!(meta && (meta.animationUrl || meta.imageUrl));
        const hasTraits =
          Array.isArray(meta?.traits) && meta.traits.length > 0;

        // If we got anything meaningful, use it immediately
        if (hasMedia || hasTraits || attempt === 5) {
          return meta;
        }
      } catch (err) {
        lastError = err;
        console.warn(
          `Metadata load attempt ${attempt} failed for ${mintAddress}:`,
          err
        );
      }

      // Exponential-ish backoff: 0.8s, 1.6s, 2.4s, 3.2s...
      await sleep(800 * attempt);
    }

    if (lastError) {
      throw lastError;
    }

    // Final ultra-fallback (should rarely be hit)
    return {
      name: "FUDker",
      imageUrl: null,
      animationUrl: null,
      traits: [],
    };
  }

  // Load Candy Machine + Guard
  useEffect(() => {
    const loadCandyMachine = async () => {
      try {
        setLoading(true);
        setError(null);

        const cmPubkey = publicKey(CANDY_MACHINE_ID);
        const cm = await fetchCandyMachine(umi, cmPubkey);
        setCandyMachine(cm);

        // Guard is attached via mintAuthority
        let guard = null;
        try {
          guard = await safeFetchCandyGuard(umi, cm.mintAuthority);
        } catch (inner) {
          console.warn("No candy guard found or unable to fetch.", inner);
        }
        setCandyGuard(guard);
      } catch (e) {
        console.error("Error loading candy machine:", e);
        setError("Failed to load Candy Machine. Check console for details.");
      } finally {
        setLoading(false);
      }
    };

    loadCandyMachine();
  }, [umi]);

  const isWalletConnected = !!wallet.publicKey;

  async function handleMint() {
    if (!wallet?.publicKey) {
      alert("Connect your wallet first.");
      return;
    }
    if (!candyMachine) {
      alert("Candy Machine not loaded yet.");
      return;
    }
    if (!candyGuard) {
      alert("Candy Guard not loaded – cannot mint.");
      return;
    }

    try {
      setMinting(true);
      setError(null);
      setLastMintAddress(null);
      setLastMintMetadata(null); // reset previous reveal

      const mintSigner = generateSigner(umi);
      const ownerPk = publicKey(wallet.publicKey.toBase58());

      // Build transaction: bump compute units + mintV2
      const builder = transactionBuilder()
        .add(
          setComputeUnitLimit(umi, {
            units: 500_000, // bump from ~200k default to 500k
          })
        )
        .add(
          mintV2(umi, {
            candyMachine: candyMachine.publicKey,
            candyGuard: candyGuard.publicKey,
            nftMint: mintSigner,
            collectionMint:
              candyMachine.collectionMint ?? publicKey(COLLECTION_MINT_ID),
            collectionUpdateAuthority: candyMachine.authority,
            mintAuthority: umi.identity,
            payer: umi.identity,
            nftOwner: ownerPk,
            tokenStandard: candyMachine.tokenStandard,
            mintArgs: {
              solPayment: some({
                destination: publicKey(CREATOR_WALLET),
              }),
              mintLimit: some({
                id: 1, // must match the guard config (id: 1, amount: 2)
              }),
            },
          })
        );

      await builder.sendAndConfirm(umi);

      const mintedAddress = mintSigner.publicKey.toString();
      console.log("Minted NFT:", mintedAddress);
      setLastMintAddress(mintedAddress);

      // 🔍 Fetch on-chain and off-chain metadata to show name, image, MP4, traits
      try {
        const metadata = await loadMintMetadataWithRetry(mintedAddress);
        console.log("Loaded mint metadata:", metadata);
        setLastMintMetadata(metadata);
      } catch (metaErr) {
        console.warn("Failed to load NFT metadata (non-fatal):", metaErr);
        // Non-fatal – user still sees mint address + Solscan link
      }

      // 🔐 Save to local mint history for gallery
      try {
        const ownerStr = wallet.publicKey.toBase58();
        const raw = localStorage.getItem(MINT_HISTORY_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        const arr = Array.isArray(data[ownerStr]) ? data[ownerStr] : [];
        if (!arr.includes(mintedAddress)) arr.push(mintedAddress);
        data[ownerStr] = arr;
        localStorage.setItem(
          MINT_HISTORY_STORAGE_KEY,
          JSON.stringify(data)
        );
      } catch (storageErr) {
        console.warn("Failed to update local mint history:", storageErr);
      }
    } catch (e) {
      console.error("Mint error:", e);
      const msg =
        (e && e.message) ||
        (typeof e === "string"
          ? e
          : "Mint failed. Check console for details.");
      setError(msg);
    } finally {
      setMinting(false);
    }
  }

  async function handleWalletLookup() {
    const addr = walletLookup.trim();
    setWalletLookupError(null);
    setWalletNfts([]);
    setWalletNftDetails({});

    if (!addr) {
      setWalletLookupError("Enter a wallet address first.");
      return;
    }

    try {
      setWalletLookupLoading(true);

      const raw = localStorage.getItem(MINT_HISTORY_STORAGE_KEY);
      if (!raw) {
        console.log("No mint history in localStorage yet.");
        setWalletNfts([]);
        return;
      }

      const data = JSON.parse(raw);
      const owned = Array.isArray(data[addr]) ? data[addr] : [];
      console.log("Lookup for wallet", addr, "found mints:", owned);
      setWalletNfts(owned);

      const details = {};

      for (const mint of owned) {
        try {
          const meta = await fetchMetadataForMintAddress(mint);
          details[mint] = meta;
        } catch (metaErr) {
          console.warn(
            "Failed to fetch metadata for wallet mint:",
            mint,
            metaErr
          );
        }
      }

      setWalletNftDetails(details);
    } catch (e) {
      console.error("Wallet lookup error:", e);
      setWalletLookupError(
        "Failed to look up local mint history. Check console for details."
      );
    } finally {
      setWalletLookupLoading(false);
    }
  }

  // ⭐ Creator tip handler
  async function handleSupportJayRa() {
    setTipError(null);
    setTipSuccess(null);

    if (!wallet?.publicKey) {
      setTipError("Connect your wallet to send a tip.");
      return;
    }

    const parsed = parseFloat(tipAmountSol);
    if (isNaN(parsed) || parsed <= 0) {
      setTipError("Enter a valid SOL amount greater than 0.");
      return;
    }

    try {
      setTipLoading(true);

      const connection = new Connection(RPC_ENDPOINT, "confirmed");
      const fromPubkey = wallet.publicKey;
      const toPubkey = new PublicKey(CREATOR_WALLET);

      const lamports = Math.round(parsed * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      );

      tx.feePayer = fromPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signature = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setTipSuccess(`Thank you! Tx: ${signature}`);
      // Optional: clear amount
      // setTipAmountSol("");
    } catch (err) {
      console.error("Tip transaction failed:", err);
      setTipError(
        (err && err.message) ||
          "Tip transaction failed. Check wallet and try again."
      );
    } finally {
      setTipLoading(false);
    }
  }

  // Helper for Solscan links
  const clusterQuery =
    ENV === "devnet" ? "?cluster=devnet" : ENV === "mainnet" ? "" : "";

  const itemsAvailable =
    candyMachine && candyMachine.data?.itemsAvailable !== undefined
      ? Number(candyMachine.data.itemsAvailable)
      : null;
  const itemsRedeemed =
    candyMachine && candyMachine.itemsRedeemed !== undefined
      ? Number(candyMachine.itemsRedeemed)
      : null;
  const itemsRemaining =
    itemsAvailable !== null && itemsRedeemed !== null
      ? itemsAvailable - itemsRedeemed
      : null;

  return (
    <div
      className="app-root"
      style={{
        minHeight: "100vh",
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "#fff",
        display: "flex",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <div
        className="app-card"
        style={{
          width: "100%",
          maxWidth: "1000px",
          background: "rgba(0,0,0,0.75)",
          borderRadius: "24px",
          padding: "1.5rem",
          boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header / Logo / Network */}
        <header
          className="app-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <img
              src={logo}
              alt="FUDkers"
              style={{ height: "56px", borderRadius: "12px" }}
            />
            <div>
              <h1 style={{ fontSize: "1.5rem", margin: 0 }}>FUDkers Mint</h1>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  opacity: 0.8,
                }}
              >
                Network: <strong>{NETWORK_LABEL}</strong>
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  opacity: 0.75,
                }}
              >
                Collection ID:{" "}
                <a
                  href={`https://solscan.io/token/${COLLECTION_MINT_ID}${clusterQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#7de0ff", textDecoration: "none" }}
                >
                  <code style={{ fontSize: "0.7rem" }}>
                    {COLLECTION_MINT_ID}
                  </code>
                </a>
              </p>
            </div>
          </div>

          <div
            className="app-header-right"
            style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}
          >
            <WalletMultiButton />
            <span
              style={{
                fontSize: "0.75rem",
                textAlign: "right",
                opacity: 0.7,
              }}
            >
              CM ID:{" "}
              <a
                href={`https://solscan.io/account/${CANDY_MACHINE_ID}${clusterQuery}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#7de0ff", textDecoration: "none" }}
              >
                <code style={{ fontSize: "0.7rem" }}>
                  {CANDY_MACHINE_ID}
                </code>
              </a>
            </span>
            {CANDY_GUARD_ID && (
              <span
                style={{
                  fontSize: "0.7rem",
                  textAlign: "right",
                  opacity: 0.7,
                }}
              >
                Guard:{" "}
                <a
                  href={`https://solscan.io/account/${CANDY_GUARD_ID}${clusterQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#7de0ff", textDecoration: "none" }}
                >
                  <code style={{ fontSize: "0.7rem" }}>
                    {CANDY_GUARD_ID}
                  </code>
                </a>
              </span>
            )}
          </div>
        </header>

        {/* Main content layout */}
        <div
          className="main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: "1.5rem",
          }}
        >
          {/* Left: Art / Info */}
          <div>
            <div
              style={{
                marginBottom: "1.25rem",
                borderRadius: "18px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <img
                src={showcase}
                alt="FUDkers Showcase"
                style={{ display: "block", width: "100%" }}
              />
            </div>

            <p style={{ fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.9 }}>
              These 51 FUDkers are a truth-seeking brand built on Fortitude,
              Understanding, and Determination—three pillars that turn fear,
              uncertainty, and doubt into unbreakable strength.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.9 }}>
              Rooted in underground hip-hop, street wisdom, and raw creative
              expression, we’re digital-age misfits who expose illusions, speak
              unfiltered truth, and build real community… block by block, beat
              by beat.
            </p>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.9 }}>
              The token is the ticket… proof you were here while the block was
              still underground. Close your two eyes, open your 3rd 👁️
            </p>
            {/* ⬆️ pack & jayra removed from here */}
          </div>

          {/* Right: Mint panel + Mint result */}
          <div>
            {/* Mint Panel */}
            <section
              style={{
                borderRadius: "18px",
                padding: "1.25rem",
                background:
                  "linear-gradient(145deg, rgba(20,20,20,0.9), rgba(40,40,40,0.9))",
                border: "1px solid rgba(255,255,255,0.12)",
                marginBottom: "1.5rem",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
                DEVNET Candy Machine #2
              </h2>

              {loading && (
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  Loading CM…
                </p>
              )}
              {error && (
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "#ff6b6b",
                    marginBottom: "0.75rem",
                  }}
                >
                  {error}
                </p>
              )}

              {/* Simple CM status */}
              {candyMachine && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    marginBottom: "0.75rem",
                    opacity: 0.85,
                  }}
                >
                  <p style={{ margin: 0 }}>
                    Items available:{" "}
                    <strong>{itemsAvailable ?? "—"}</strong>
                  </p>
                  <p style={{ margin: 0 }}>
                    Items minted:{" "}
                    <strong>{itemsRedeemed ?? "—"}</strong>
                  </p>
                  <p style={{ margin: 0 }}>
                    Items remaining:{" "}
                    <strong>{itemsRemaining ?? "—"}</strong>
                  </p>
                </div>
              )}

              {/* Guard summary */}
              {candyGuard && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                    marginBottom: "0.75rem",
                    opacity: 0.85,
                  }}
                >
                  Price: <strong>{MINT_PRICE_SOL} SOL</strong> · Mint limit:{" "}
                  <strong>2 per wallet</strong>
                </p>
              )}

              <button
                onClick={handleMint}
                disabled={!isWalletConnected || loading || minting}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  marginTop: "0.75rem",
                  borderRadius: "999px",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "1rem",
                  cursor:
                    !isWalletConnected || loading || minting
                      ? "not-allowed"
                      : "pointer",
                  background:
                    !isWalletConnected || loading || minting
                      ? "rgba(120,120,120,0.6)"
                      : "linear-gradient(135deg,#ff9b00,#ff3b6b)",
                  color: "#000",
                  boxShadow:
                    !isWalletConnected || loading || minting
                      ? "none"
                      : "0 12px 28px rgba(0,0,0,0.65)",
                  transition: "transform 0.08s ease, box-shadow 0.08s ease",
                }}
              >
                {!isWalletConnected
                  ? "Connect wallet to mint"
                  : minting
                  ? "Minting..."
                  : "Mint your FUDker"}
              </button>

              {/* 🧃 Pack image lives here, disappears after mint */}
              {!lastMintAddress && !minting && (
                <div
                  style={{
                    marginTop: "1.25rem",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={pack}
                    alt="FUDkers Pack"
                    style={{
                      width: "100%",
                      maxWidth: "260px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.18)",
                      boxShadow: "0 16px 38px rgba(0,0,0,0.75)",
                    }}
                  />
                </div>
              )}
            </section>

            {/* 🔔 Mint success section with reveal + traits */}
            {lastMintAddress && (
              <section
                style={{
                  marginBottom: "1.5rem",
                  padding: "1.5rem",
                  borderRadius: "24px",
                  background:
                    "radial-gradient(circle at top left, rgba(255,255,255,0.08), rgba(0,0,0,0.7))",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
                  ✨ Pack opened! You pulled:
                </h2>

                {lastMintMetadata && (
                  <>
                    <h3
                      style={{
                        margin: 0,
                        marginBottom: "0.75rem",
                        fontSize: "1.1rem",
                      }}
                    >
                      {lastMintMetadata.name}
                    </h3>

                    {/* Big media + traits side by side */}
                    {(lastMintMetadata.animationUrl ||
                      lastMintMetadata.imageUrl ||
                      (lastMintMetadata.traits &&
                        lastMintMetadata.traits.length > 0)) && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "16px",
                          alignItems: "flex-start",
                          justifyContent: "center",
                          marginBottom: "0.75rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        {/* Left: BIG video/image */}
                        {(() => {
                          let media = null;
                          if (lastMintMetadata.animationUrl) {
                            media = (
                              <video
                                src={lastMintMetadata.animationUrl}
                                controls
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "contain",
                                }}
                              />
                            );
                          } else if (lastMintMetadata.imageUrl) {
                            media = (
                              <img
                                src={lastMintMetadata.imageUrl}
                                alt={lastMintMetadata.name}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "contain",
                                }}
                              />
                            );
                          }

                          if (!media) return null;

                          return (
                            <div
                              className="media-square"
                              style={{
                                width: "480px",
                                height: "480px",
                                maxWidth: "100%",
                                borderRadius: "16px",
                                overflow: "hidden",
                                background: "#000",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {media}
                            </div>
                          );
                        })()}

                        {/* Right: Traits */}
                        {lastMintMetadata.traits &&
                          lastMintMetadata.traits.length > 0 && (
                            <div
                              style={{
                                minWidth: "220px",
                                flex: "1 1 220px",
                              }}
                            >
                              <h4
                                style={{
                                  margin: "0 0 8px",
                                  fontSize: "14px",
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  color: "#aaa",
                                }}
                              >
                                Traits
                              </h4>
                              <ul
                                style={{
                                  listStyle: "none",
                                  padding: 0,
                                  margin: 0,
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(140px, 1fr))",
                                  gap: "8px 16px",
                                }}
                              >
                                {lastMintMetadata.traits.map((trait) => (
                                  <li
                                    key={trait.id}
                                    style={{
                                      fontSize: "14px",
                                      background:
                                        "rgba(255, 255, 255, 0.04)",
                                      borderRadius: "8px",
                                      padding: "8px 10px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                        color: "#bbb",
                                        marginBottom: "2px",
                                      }}
                                    >
                                      {trait.trait_type}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        color: "#fff",
                                      }}
                                    >
                                      {trait.value}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}

                    <p
                      style={{
                        fontSize: "0.8rem",
                        opacity: 0.75,
                        marginTop: 0,
                        marginBottom: "0.75rem",
                        textAlign: "center",
                      }}
                    >
                      Screenshot your FUDker and share this pull with the
                      Neighborhood 🧱
                    </p>
                  </>
                )}

                <p
                  style={{
                    fontSize: "0.85rem",
                    opacity: 0.8,
                    marginBottom: "0.25rem",
                  }}
                >
                  Mint address:
                </p>
                <p
                  style={{
                    fontSize: "0.85rem",
                    wordBreak: "break-all",
                    marginTop: 0,
                    marginBottom: "0.75rem",
                  }}
                >
                  {lastMintAddress}
                </p>

                <a
                  href={`https://solscan.io/token/${lastMintAddress}${clusterQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0.6rem 1.1rem",
                    borderRadius: "999px",
                    background:
                      "linear-gradient(90deg, #ffbf5f 0%, #ff5f7e 50%, #8b5bff 100%)",
                    color: "#0b0b0b",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    textDecoration: "none",
                    marginBottom: "0.75rem",
                  }}
                >
                  View mint on Solscan
                </a>

                <p
                  style={{
                    fontSize: "0.8rem",
                    opacity: 0.7,
                    margin: 0,
                  }}
                >
                  (Your wallet / NFT viewer that supports Metaplex NFTs will also
                  show the full PNG and MP4.)
                </p>
              </section>
            )}
          </div>
        </div>

        {/* Find your FUDkers */}
        <section
          style={{
            marginTop: "2rem",
            padding: "1.25rem",
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(5,5,5,0.75)",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            🔎 Find your FUDkers
          </h2>
          <p
            style={{
              fontSize: "0.9rem",
              opacity: 0.8,
              marginBottom: "0.5rem",
            }}
          >
            Paste any Solana wallet address to see which CM #2 FUDkers this
            browser has watched mint to that wallet (devnet rehearsal only).
          </p>
          <p
            style={{
              fontSize: "0.8rem",
              opacity: 0.7,
              marginBottom: "0.75rem",
            }}
          >
            This tool tracks mints that happened from this browser / device. If
            you minted on another setup, your FUDkers are still on-chain in your
            wallet — they just won&apos;t show up in this local history.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "0.75rem",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={walletLookup}
              onChange={(e) => setWalletLookup(e.target.value)}
              placeholder="Enter wallet address"
              style={{
                flex: "1 1 260px",
                minWidth: "0",
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid #555",
                background: "#111",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            />
            <button
              onClick={handleWalletLookup}
              disabled={walletLookupLoading}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "999px",
                border: "none",
                fontWeight: 600,
                cursor: walletLookupLoading ? "wait" : "pointer",
                background: walletLookupLoading
                  ? "rgba(120,120,120,0.7)"
                  : "linear-gradient(135deg,#41e3ff,#ff3bff)",
                color: "#000",
                minWidth: "140px",
                fontSize: "0.85rem",
              }}
            >
              {walletLookupLoading ? "Checking..." : "Show FUDkers"}
            </button>

            {wallet?.publicKey && (
              <button
                type="button"
                onClick={() => setWalletLookup(wallet.publicKey.toBase58())}
                style={{
                  padding: "0.45rem 0.9rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backgroundColor: "transparent",
                  color: "#fff",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                Use connected wallet
              </button>
            )}
          </div>

          {walletLookupError && (
            <p
              style={{
                fontSize: "0.85rem",
                color: "#ff6b6b",
                marginBottom: "0.75rem",
              }}
            >
              {walletLookupError}
            </p>
          )}

          {!walletLookupLoading &&
            walletNfts.length === 0 &&
            !walletLookupError &&
            walletLookup && (
              <p
                style={{
                  fontSize: "0.85rem",
                  opacity: 0.7,
                }}
              >
                No CM #2 FUDkers in this browser&apos;s history for that wallet
                yet — or they were minted on a different device / browser.
              </p>
            )}

          {walletNfts.length > 0 && (
            <div
              style={{
                marginTop: "0.75rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "1rem",
              }}
            >
              {walletNfts.map((mint) => {
                const details = walletNftDetails[mint] || {};

                // ✅ Only show ONE media element – prefer animation (MP4), fallback to PNG
                let media = null;
                if (details.animationUrl) {
                  media = (
                    <video
                      src={details.animationUrl}
                      controls
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  );
                } else if (details.imageUrl) {
                  media = (
                    <img
                      src={details.imageUrl}
                      alt={details.name || mint}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  );
                }

                const hasTraits =
                  details.traits && details.traits.length > 0;

                return (
                  <div
                    key={mint}
                    style={{
                      padding: "0.9rem",
                      borderRadius: "14px",
                      background: "rgba(20,20,20,0.9)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 600,
                          fontSize: "0.9rem",
                        }}
                      >
                        {details.name || "FUDker Mint"}
                      </p>
                      <p
                        style={{
                          margin: "0.15rem 0 0.25rem",
                          fontSize: "0.75rem",
                          opacity: 0.7,
                        }}
                      >
                        CM #2 · Devnet rehearsal
                      </p>
                    </div>

                    {(media || hasTraits) && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "16px",
                          alignItems: "flex-start",
                          justifyContent: "center",
                        }}
                      >
                        {/* Left: BIG video/image */}
                        {media && (
                          <div
                            className="media-square"
                            style={{
                              width: "480px",
                              height: "480px",
                              maxWidth: "100%",
                              borderRadius: "16px",
                              overflow: "hidden",
                              background: "#000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {media}
                          </div>
                        )}

                        {/* Right: Traits */}
                        {hasTraits && (
                          <div
                            style={{
                              minWidth: "220px",
                              flex: "1 1 220px",
                            }}
                          >
                            <h4
                              style={{
                                margin: "0 0 8px",
                                fontSize: "14px",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "#aaa",
                              }}
                            >
                              Traits
                            </h4>
                            <ul
                              style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(140px, 1fr))",
                                gap: "8px 16px",
                              }}
                            >
                              {details.traits.map((trait) => (
                                <li
                                  key={trait.id}
                                  style={{
                                    fontSize: "14px",
                                    background:
                                      "rgba(255, 255, 255, 0.04)",
                                    borderRadius: "8px",
                                    padding: "8px 10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                      color: "#bbb",
                                      marginBottom: "2px",
                                    }}
                                  >
                                      {trait.trait_type}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      color: "#fff",
                                    }}
                                  >
                                      {trait.value}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <p
                      style={{
                        margin: "0.25rem 0 0.25rem",
                        fontSize: "0.75rem",
                        opacity: 0.8,
                        wordBreak: "break-all",
                      }}
                    >
                      {mint}
                    </p>
                    <a
                      href={`https://solscan.io/token/${mint}${clusterQuery}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: "0.25rem",
                        fontSize: "0.75rem",
                        color: "#7de0ff",
                        textDecoration: "none",
                      }}
                    >
                      View on Solscan →
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FUDker PFP Asset Grid */}
        <section
          style={{
            marginTop: "2rem",
            padding: "1.5rem",
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(3,3,3,0.85)",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            🧩 FUDker PFP Kit
          </h2>
          <p
            style={{
              fontSize: "0.85rem",
              opacity: 0.8,
              marginBottom: "1rem",
            }}
          >
            Transparent PNGs of each FUDker, perfect for PFPs, flyers, content,
            and remixes. Right-click / tap-hold to save.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "1rem",
            }}
          >
            {FUDKER_PFPS.map(({ name, src }) => (
              <div
                key={name}
                style={{
                  background: "rgba(15,15,15,0.95)",
                  borderRadius: "16px",
                  padding: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
                  transition:
                    "transform 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={src}
                    alt={name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    textAlign: "center",
                    letterSpacing: "0.02em",
                  }}
                >
                  {name}
                </p>
              </div>
            ))}
          </div>

          {/* 🌟 Creator Tip / Support JayRa section */}
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(255,255,255,0.16)",
              display: "flex",
              flexWrap: "wrap",
              gap: "1.25rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                flex: "0 0 260px",
                maxWidth: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <img
                src={jayra}
                alt="JayRaTheRu"
                style={{
                  width: "100%",
                  maxWidth: "260px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.85)",
                }}
              />
            </div>

            <div
              style={{
                flex: "1 1 260px",
                minWidth: "0",
              }}
            >
              <h3
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "1rem",
                }}
              >
                💿 Creator Tip — Support JayRa
              </h3>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.9rem",
                  opacity: 0.85,
                }}
              >
                If you vibe with the art, the music, and the Neighborhood
                we&apos;re building, you can send a small SOL tip to help keep
                the crates pressed, dev paid, and the story moving forward.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.1"
                  value={tipAmountSol}
                  onChange={(e) => setTipAmountSol(e.target.value)}
                  style={{
                    flex: "1 1 120px",
                    minWidth: "0",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #555",
                    background: "#111",
                    color: "#fff",
                    fontSize: "0.85rem",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.85rem",
                    opacity: 0.8,
                    marginRight: "0.25rem",
                  }}
                >
                  SOL
                </span>
                <button
                  onClick={handleSupportJayRa}
                  disabled={tipLoading}
                  style={{
                    padding: "0.5rem 1.1rem",
                    borderRadius: "999px",
                    border: "none",
                    fontWeight: 600,
                    cursor: tipLoading ? "wait" : "pointer",
                    background: tipLoading
                      ? "rgba(120,120,120,0.8)"
                      : "linear-gradient(135deg,#ffbf5f,#ff3bff)",
                    color: "#000",
                    fontSize: "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tipLoading ? "Sending..." : "Support JayRa"}
                </button>
              </div>

              {!isWalletConnected && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    opacity: 0.75,
                  }}
                >
                  Connect your wallet above to send a tip.
                </p>
              )}

              {tipError && (
                <p
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "0.8rem",
                    color: "#ff6b6b",
                  }}
                >
                  {tipError}
                </p>
              )}

              {tipSuccess && (
                <p
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "0.8rem",
                    color: "#7de0ff",
                    wordBreak: "break-all",
                  }}
                >
                  {tipSuccess}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Footer / Social */}
        <footer
          style={{
            marginTop: "1.5rem",
            fontSize: "0.8rem",
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          <div>
            Follow{" "}
            <a
              href="https://x.com/FUDkerOTB"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#7de0ff", textDecoration: "none" }}
            >
              JayRaTheFUDker
            </a>{" "}
            on X for drops &amp; Neighborhood updates.
          </div>
          <div
            style={{
              marginTop: "0.3rem",
              fontSize: "0.75rem",
              opacity: 0.7,
            }}
          >
            Site version <code>{SITE_VERSION}</code> · Devnet CM #2 rehearsal
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
