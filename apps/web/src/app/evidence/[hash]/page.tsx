import type { Metadata } from "next";
import { VerifyView } from "../verify-view";

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const { hash } = await params;
  const q = decodeURIComponent(hash);
  return { title: /^\d+$/.test(q.replace(/^#/, "")) ? `Verify token #${q.replace(/^#/, "")}` : "Verify evidence" };
}

export default async function Page({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return <VerifyView query={decodeURIComponent(hash)} />;
}
