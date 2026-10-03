import type { Metadata } from "next";
import { InterviewsView } from "./interviews-view";

export const metadata: Metadata = { title: "Interviews" };

export default function Page() {
  return <InterviewsView />;
}
