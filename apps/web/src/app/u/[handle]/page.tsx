import type { Metadata } from "next";
import { ProfileView } from "./profile-view";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} />;
}
