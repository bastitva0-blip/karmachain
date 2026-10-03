import { RecruiterNav } from "./recruiter-nav";

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RecruiterNav />
      {children}
    </>
  );
}
