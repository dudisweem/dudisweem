"use client";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "solid" | "ghost" | "quiet" | "danger";
  sm?: boolean;
  full?: boolean;
  pendingLabel?: string;
  children: ReactNode;
};

/** Disabled + aria-busy while the server works; no double submit. */
export function SubmitButton({ variant = "primary", sm, full, pendingLabel = "שומרים…", children, className, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={pending || undefined}
      className={["btn", variant, sm ? "sm" : "", full ? "full" : "", className ?? ""].join(" ").trim()}
    >
      {pending ? (
        <>
          <span className="spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
