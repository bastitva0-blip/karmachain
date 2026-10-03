import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-[10px] border border-border-strong bg-ground px-3.5 text-[15px] text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-karma disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-[72px] resize-y py-3 leading-normal", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-11 capitalize", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("flex flex-col gap-1.5 text-[13px] text-ink-muted", className)} {...props} />;
}
