/** Spinning chariot wheel with the seal K, used on the 404 page. Spin stops under reduced motion. */
export function ChariotWheel({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" stroke="#B9A6FF" strokeWidth="3" aria-hidden>
      <g className="origin-center motion-safe:animate-[spin_18s_linear_infinite]" style={{ transformBox: "fill-box" }} opacity=".5">
        <circle cx="100" cy="100" r="80" />
        <circle cx="100" cy="100" r="14" />
        <path d="M100 20V180M20 100H180M43 43L157 157M157 43L43 157" />
      </g>
      <path d="M86 70v60M86 104l30-34M98 92l22 38" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
    </svg>
  );
}
