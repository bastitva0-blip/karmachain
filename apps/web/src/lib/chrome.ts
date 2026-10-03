/** Full-screen interview phases and the guided demo render without the site header/footer. */
export const isImmersive = (path: string) => /^\/interview\/[^/]+\/?$/.test(path) || /^\/demo\/?$/.test(path);

/** "demo-arjun-dev" → "AR", "Mei Lin" → "ML". */
export function initials(s: string): string {
  const words = s
    .replace(/^@/, "")
    .replace(/^demo-/i, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
