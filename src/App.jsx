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

import {
  RPC_ENDPOINT,
  CANDY_MACHINE_ID,
  CANDY_GUARD_ID,
  COLLECTION_MINT_ID,
  NETWORK_LABEL,
} from "./chainConfig.js";

import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
} from "@solana/web3.js";

import bg from "./assets/bg.png";
import logo from "./assets/logo.png";
import showcase from "./assets/fudkers-showcase.gif";
import pack from "./assets/pack.png";
import jayra from "./assets/jayra.png";

// 👉 Creator tip wallet (devnet/mainnet-safe; you control this)
const CREATOR_TIP_ADDRESS = "6WbBX58cHCcuhR6BPpCDXm5eRULuxwxes7jwEodTWtHc";

function App() {
  const wallet = useWallet();

  const [status, setStatus] = useState("Wallet not connected");
  const [isMinting, setIsMinting] = useState(false);
  const [lastMint, setLastMint] = useState(null); // asset address
  const [lastMintSig, setLastMintSig] = useState(null); // tx signature
  const [error, setError] = useState(null);
  const [supplyText, setSupplyText] = useState("Loading...");
  const [sessionMints, setSessionMints] = useState(0); // “Holding” for this session only

  console.log("FUDKERS MINT | Network:", NETWORK_LABEL, "| RPC:", RPC_ENDPOINT);
  console.log("CM:", CANDY_MACHINE_ID, "Guard:", CANDY_GUARD_ID);

  // Umi instance bound to wallet + current RPC endpoint
  const umi = useMemo(() => {
    let instance = createUmi(RPC_ENDPOINT).use(mplCore()).use(mplCandyMachine());

    if (wallet && wallet.publicKey) {
      instance = instance.use(walletAdapterIdentity(wallet));
    }

    return instance;
  }, [wallet, RPC_ENDPOINT]);

  // Helper to coerce BN / bigint / number to plain number
  const toNum = (value) => {
    if (value == null) return null;
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value.toNumber === "function") return value.toNumber();
    return null;
  };

  // Load CM supply / stats
  async function loadCandyMachineStats() {
    try {
      const cm = await fetchCandyMachine(umi, publicKey(CANDY_MACHINE_ID));
      console.log("Candy Machine account:", cm);

      const itemsAvailableRaw =
        cm.itemsAvailable ??
        cm.data?.itemsAvailable ??
        cm.config?.itemsAvailable ??
        null;

      const itemsRedeemedRaw =
        cm.itemsRedeemed ??
        cm.data?.itemsRedeemed ??
        cm.config?.itemsRedeemed ??
        null;

      const itemsAvailable = toNum(itemsAvailableRaw);
      const itemsRedeemed = toNum(itemsRedeemedRaw);

      if (itemsAvailable != null && itemsRedeemed != null) {
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

      // 6. Call mintV1 and capture the *signature*
      const txSig = await mintV1(umi, {
        candyMachine: candyMachine.publicKey,
        collection: candyMachine.collectionMint ?? publicKey(COLLECTION_MINT_ID),
        asset,
        candyGuard: candyGuard.publicKey,
        mintArgs,
        ...(MINT_GROUP ? { group: MINT_GROUP } : {}),
      }).sendAndConfirm(umi);

      console.log("Mint tx signature:", txSig);
      const mintAddress = String(asset.publicKey);

      setLastMint(mintAddress);
      setLastMintSig(String(txSig));
      setSessionMints((prev) => prev + 1); // just this tab/session
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

  // 💸 Creator Tip button – sends SOL to CREATOR_TIP_ADDRESS
  async function handleCreatorTip() {
    setError(null);

    if (!wallet || !wallet.connected || !wallet.publicKey) {
      setStatus("Connect your Phantom wallet first.");
      return;
    }

    if (!CREATOR_TIP_ADDRESS) {
      setError("Creator tip address not configured yet.");
      return;
    }

    try {
      setStatus("Building creator tip…");

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
          toPubkey: new PublicKey(CREATOR_TIP_ADDRESS),
          lamports: 1000000, // 0.001 SOL tip on devnet (tweak on mainnet)
        })
      );

      const sig = await wallet.sendTransaction(tx, connection);
      console.log("Creator tip tx signature:", sig);

      setStatus("Creator tip sent: " + sig);
    } catch (e) {
      console.error("Creator tip error RAW:", e);
      console.error("Creator tip error cause:", e?.cause);
      setStatus("Creator tip failed.");
      setError(e?.message || "Creator tip error");
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
              className="mint-logo-img"
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

          {/* New brand copy */}
          <p className="mint-copy">
            These 51 FUDkers are a truth-seeking brand built on Fortitude,
            Understanding, and Determination—three pillars that turn fear,
            uncertainty, and doubt into unbreakable strength.
          </p>
          <p className="mint-copy secondary">
            Rooted in underground hip-hop, street wisdom, and raw creative
            expression, we’re digital-age misfits who expose illusions, speak
            unfiltered truth, and build real community… block by block, beat by
            beat. IP you can flip, sample, print, or press to vinyl.
          </p>
          <p className="mint-copy secondary">
            The token is the ticket… proof you were here while the block was
            still underground. Close your two eyes, open your 3rd 👁️
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
            <div className="mint-stat">
              <div className="mint-stat-label">Holding (this session)</div>
              <div className="mint-stat-value">
                {wallet.connected ? sessionMints : "—"}
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
            Come kick it in the Neighborhood, FUDkers...
          </div>
        </div>

        {/* RIGHT SIDE – Wallet + Pack + Creator Tip */}
        <div className="mint-right">
          {/* Wallet card */}
          <div className="mint-wallet-card">
            <div className="mint-wallet-row">
              <div className="mint-wallet-label">Wallet</div>
              <WalletMultiButton />
            </div>
            {error && <div className="mint-alert">{error}</div>}
            {wallet.connected && (
              <div className="mint-status subtle">
                Connected as {shortAddress}
              </div>
            )}
          </div>

          {/* Pack / Mint card */}
          <div className="mint-pack-frame">
            <div className="mint-pack-header">
              <div className="mint-pack-label">
                Pack Rip • <span>Random FUDker</span>
              </div>
              <div className="mint-pack-subtext">
                Rip a 1-of-1 misfit straight from the Neighborhood Candy
                Machine.
              </div>
            </div>
            <img
              src={pack}
              alt="FUDkers Pack"
              className="mint-pack-img"
            />
            <button
              className="mint-button-primary"
              disabled={isMinting || !wallet.connected}
              onClick={handleMint}
            >
              {isMinting ? "Minting…" : "Mint a FUDker"}
            </button>
            {!wallet.connected && (
              <div className="mint-status" style={{ marginTop: 6 }}>
                Connect Phantom to rip a pack.
              </div>
            )}
          </div>

          {/* Creator Tip card – uses jayra.png */}
          <div className="mint-pack-frame mint-creator-frame">
            <div className="mint-pack-header">
              <div className="mint-pack-label">
                Creator Tip • <span>Support JayRa</span>
              </div>
              <div className="mint-pack-subtext">
                Drop a tip if you’re feeling the beats, the truth, or just wanna
                keep an independent artist eating while the block gets built.
                No label. No middleman. Just love back to the source.
              </div>
              <a
                href="https://x.com/FUDkerOTB"
                target="_blank"
                rel="noreferrer"
                className="mint-creator-link"
              >
                Follow on X ↗
              </a>
            </div>
            <img
              src={jayra}
              alt="JayRaTheRu"
              className="mint-creator-img"
            />
            <button
              className="mint-button-primary"
              style={{ marginTop: 4 }}
              disabled={!wallet.connected}
              onClick={handleCreatorTip}
            >
              Send Creator Tip
            </button>
          </div>

          {/* Last mint box */}
          {lastMint && (
            <div className="mint-success">
              <div className="mint-success-heading">Last Mint</div>

              <div className="mint-success-row">
                <div className="mint-success-label">Asset</div>
                <div className="mint-success-code">{lastMint}</div>
              </div>

              {lastMintSig && (
                <div className="mint-success-row" style={{ marginTop: 4 }}>
                  <div className="mint-success-label">Tx</div>
                  <a
                    href={`https://explorer.solana.com/tx/${lastMintSig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="mint-success-code"
                    style={{ color: "#f5a01f", textDecoration: "underline" }}
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
