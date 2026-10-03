import { BASESCAN } from "@karma/shared";
import { cn } from "@/lib/utils";

export const truncate = (h: string, head = 6, tail = 4) => (h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

const cls = "font-mono text-[13px] no-underline hover:underline";

function Ext({ href, children, className, label }: { href: string; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(cls, className)} aria-label={label}>
      {children} <span aria-hidden>↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** `tx 0x41c2…9a0d ↗` */
export function TxLink({ hash, prefix = "tx ", className }: { hash: string; prefix?: string; className?: string }) {
  return (
    <Ext href={`${BASESCAN}/tx/${hash}`} className={className}>
      {prefix}
      {truncate(hash)}
    </Ext>
  );
}

/** `0x7a3f…c91e ↗` */
export function AddressLink({ address, className }: { address: string; className?: string }) {
  return (
    <Ext href={`${BASESCAN}/address/${address}`} className={className}>
      {truncate(address)}
    </Ext>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Ext href={href} className={cn("font-sans text-sm", className)}>
      {children}
    </Ext>
  );
}
