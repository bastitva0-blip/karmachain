"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";
import { CHAIN, wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          initialChain={CHAIN}
          theme={darkTheme({ accentColor: "#B9A6FF", accentColorForeground: "#0B0A10", borderRadius: "medium" })}
        >
          {/* Honour prefers-reduced-motion for every animation. */}
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
          <Toaster theme="light" position="bottom-left" closeButton toastOptions={{ style: { background: "#EDEAF5", color: "#0B0A10", border: "0", borderRadius: "10px", fontFamily: "var(--font-plex-sans)" } }} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
