"use client";
import { useState, type ReactNode } from "react";
import { SubmitButton } from "@/ui/SubmitButton";

/**
 * Two-step destructive action inside a form: first tap asks, second tap submits.
 * Replaces window.confirm (blocked in some viewers and bad on mobile).
 */
export function ConfirmButton({
  children,
  confirmLabel = "כן, לבצע",
  question = "בטוח?",
  variant = "danger",
  sm = true,
}: {
  children: ReactNode;
  confirmLabel?: string;
  question?: string;
  variant?: "danger" | "solid" | "primary" | "ghost";
  sm?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={`btn ${variant} ${sm ? "sm" : ""}`} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="confirm-row" role="group" aria-label={question}>
      <span className="small" style={{ fontWeight: 700 }}>{question}</span>
      <SubmitButton variant={variant === "danger" ? "danger" : "solid"} sm={sm}>
        {confirmLabel}
      </SubmitButton>
      <button type="button" className={`btn quiet ${sm ? "sm" : ""}`} onClick={() => setAsking(false)}>
        ביטול
      </button>
    </span>
  );
}
