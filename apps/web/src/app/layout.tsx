import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "./providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "KarmaChain", template: "%s · KarmaChain" },
  description: "Your work, proven. Not claimed. Verified GitHub work as soulbound proof, recruiter matching and voice interviews.",
};

export const viewport: Viewport = { themeColor: "#0B0A10", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="fixed left-4 top-[-60px] z-[60] rounded-lg bg-karma px-4 py-2.5 font-semibold text-ground no-underline focus:top-3"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
