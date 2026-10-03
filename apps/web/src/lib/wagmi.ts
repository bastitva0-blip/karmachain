"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const hasWalletConnect = /^[0-9a-f]{32}$/i.test(projectId);

/**
 * Base Sepolia only. Base Account (passkey smart wallet, no extension needed) and any
 * browser wallet always work; MetaMask / Rainbow / WalletConnect QR are added when a
 * WalletConnect (Reown) project id is configured.
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: hasWalletConnect ? [baseAccount, metaMaskWallet, coinbaseWallet, rainbowWallet] : [baseAccount, coinbaseWallet],
    },
    { groupName: "Other", wallets: hasWalletConnect ? [walletConnectWallet, injectedWallet] : [injectedWallet] },
  ],
  {
    appName: "KarmaChain",
    appDescription: "Verified work as soulbound proof",
    projectId: hasWalletConnect ? projectId : "00000000000000000000000000000000",
  },
);

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors,
  transports: { [baseSepolia.id]: http() },
  ssr: true,
});

export const CHAIN = baseSepolia;
