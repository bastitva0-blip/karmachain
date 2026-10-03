import type { Metadata } from "next";
import { ImportView } from "./import-view";

export const metadata: Metadata = { title: "Import work" };

export default function Page() {
  return <ImportView />;
}
