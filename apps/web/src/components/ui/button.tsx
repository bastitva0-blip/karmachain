import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans no-underline transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-karma font-semibold text-ground hover:bg-karma-hover hover:text-ground",
        outline: "border border-border-strong bg-transparent font-medium text-ink hover:bg-surface-2 hover:text-ink",
        secondary: "bg-surface-2 font-medium text-ink hover:bg-[#241F33] hover:text-ink",
        ghost: "font-medium text-ink hover:bg-surface-2 hover:text-ink",
        destructive: "border border-error-border bg-transparent font-medium text-error hover:bg-error-bg hover:text-error",
        danger: "bg-danger font-semibold text-white hover:bg-[#cf3b40] hover:text-white",
        link: "font-medium text-karma underline underline-offset-4 hover:text-karma-hover",
      },
      size: {
        default: "h-11 rounded-[10px] px-[18px] text-[15px]",
        sm: "h-9 rounded-[10px] px-3.5 text-sm",
        lg: "h-[52px] rounded-xl px-6 text-base",
        icon: "size-11 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
