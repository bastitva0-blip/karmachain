import type { Metadata } from "next";
import { RecruiterView } from "./recruiter-view";

export const metadata: Metadata = { title: "Recruiter" };

export default function Page() {
  return <RecruiterView />;
}
