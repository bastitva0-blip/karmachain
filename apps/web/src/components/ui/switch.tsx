"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-track transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-karma data-[state=checked]:bg-karma",
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-ink shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-ground" />
    </S.Root>
  );
}
