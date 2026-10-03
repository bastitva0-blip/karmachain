import type { Metadata } from "next";
import { VerifyView } from "./verify-view";

export const metadata: Metadata = {
  title: "Verify evidence",
  description: "Paste an evidence hash or token ID. We hash the evidence in your browser and compare it with what's stored on-chain.",
};

export default function Page() {
  return <VerifyView query={null} />;
}
