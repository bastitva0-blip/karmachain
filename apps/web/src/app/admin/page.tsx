import type { Metadata } from "next";
import { AdminView } from "./admin-view";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function Page() {
  return <AdminView />;
}
