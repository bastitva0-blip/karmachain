import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const shortAddr = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
