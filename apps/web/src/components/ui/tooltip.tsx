"use client";

import { Tooltip as T } from "radix-ui";

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 max-w-[260px] rounded-lg bg-ink px-3 py-2.5 text-[13px] text-ground shadow-lg">
            {content}
            <T.Arrow className="fill-ink" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
