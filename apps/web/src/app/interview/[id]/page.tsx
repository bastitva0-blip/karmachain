import type { Metadata } from "next";
import { InterviewRoom } from "./interview-room";

export const metadata: Metadata = { title: "Interview" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fallback?: string }>;
}) {
  const { id } = await params;
  const { fallback } = await searchParams;
  return <InterviewRoom id={id} forceFallback={fallback === "1"} />;
}
