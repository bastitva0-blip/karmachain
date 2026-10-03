import type { Metadata } from "next";
import { DemoView } from "./demo-view";

export const metadata: Metadata = {
  title: "Demo",
  description: "An 8-step guided walkthrough of KarmaChain with the labelled demo profile @priya-builds.",
};

export default function Page() {
  return <DemoView />;
}
