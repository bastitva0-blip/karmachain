"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <Dialog.Title className="display text-xl font-bold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="text-sm text-ink-muted">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <Dialog.Close
            className="grid size-9 place-items-center rounded-[10px] border border-border-strong text-ink hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="size-4" />
          </Dialog.Close>
        </div>
        <div className="flex flex-col gap-6 p-6">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
