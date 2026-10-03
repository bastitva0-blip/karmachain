import type { Metadata } from "next";
import { ReviewFlow } from "./review-flow";

export const metadata: Metadata = { title: "Leave a review" };

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ReviewFlow handle={decodeURIComponent(handle)} />;
}
