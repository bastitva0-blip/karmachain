import type { Metadata } from "next";
import { FeedView } from "./feed-view";

export const metadata: Metadata = { title: "Proof feed" };

export default function Page() {
  return <FeedView />;
}
