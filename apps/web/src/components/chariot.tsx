/** Line-art Krishna–Arjun chariot for the landing hero. Decorative; motion classes live in app/landing.css. */
export function Chariot({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 500"
      className={className}
      fill="none"
      stroke="#B9A6FF"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <radialGradient id="kc-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#E4DBFF" stopOpacity=".9" />
          <stop offset="1" stopColor="#7C5CFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <line x1="20" y1="470" x2="780" y2="470" strokeWidth="1" opacity=".4" />
      <path d="M60 470 C 180 440, 260 452, 380 470" strokeWidth="1" opacity=".3" />
      <path d="M395 290 L160 330 M395 296 L160 350" strokeWidth="1.5" opacity=".55" />
      <path d="M120 300 q20 -30 45 -20 l10 25 q-5 25 -10 50 l-30 40 M140 340 l-25 60 M165 340 l15 60" strokeWidth="3" opacity=".5" />
      <path d="M85 320 q20 -30 45 -20 l10 25 q-5 25 -10 50 l-30 40 M105 360 l-25 60 M130 360 l15 60" strokeWidth="3" opacity=".35" />
      <circle className="kc-halo" cx="430" cy="205" r="62" fill="url(#kc-halo)" stroke="none" />
      <g strokeWidth="2.2">
        <line className="kc-ray" x1="482" y1="190" x2="560" y2="150" />
        <line className="kc-ray" x1="482" y1="190" x2="575" y2="190" />
        <line className="kc-ray" x1="482" y1="190" x2="555" y2="232" />
      </g>
      <path d="M400 360 L410 300 L630 300 L640 360 Z" strokeWidth="3" fill="#1A1430" />
      <path d="M380 360 L660 360 L640 398 L400 398 Z" strokeWidth="3" fill="#120E22" />
      <g className="kc-wheel" strokeWidth="3">
        <circle cx="520" cy="410" r="58" />
        <circle cx="520" cy="410" r="10" />
        <path d="M520 352V468M462 410H578M479 369L561 451M561 369L479 451M498 356L542 464M542 356L498 464M466 388L574 432M574 388L466 432" />
      </g>
      <line x1="625" y1="300" x2="625" y2="110" strokeWidth="3" />
      <path className="kc-flag" d="M625 112 Q665 122 705 112 L705 160 Q665 170 625 160 Z" fill="#B9A6FF33" strokeWidth="2" />
      <g strokeWidth="5">
        <circle cx="430" cy="205" r="16" fill="#1A1430" />
        <path d="M438 191 q8 -26 26 -30" strokeWidth="2.5" />
        <path d="M430 221 L433 300" />
        <path d="M432 238 L466 214 L482 190" />
        <path d="M430 245 L398 290" />
      </g>
      <path d="M416 258 L448 258 L456 300 L410 300 Z" fill="#B9A6FF22" strokeWidth="2" />
      <g strokeWidth="5">
        <circle cx="578" cy="252" r="15" fill="#1A1430" />
        <path d="M577 268 L566 318 L600 336 L604 300" />
        <path d="M572 284 L548 304" />
      </g>
      <path d="M612 232 Q652 296 612 356" strokeWidth="3" />
      <line x1="612" y1="232" x2="612" y2="356" strokeWidth="1" />
    </svg>
  );
}
