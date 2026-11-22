"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";

type State = { error?: string; ok?: string } | null;

/** Two-step destructive action in place (no browser confirm dialogs). */
export function ConfirmAction({
  action,
  fields,
  label,
  question,
  confirmLabel,
  disabled,
  disabledReason,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  fields: Record<string, string>;
  label: string;
  question: string;
  confirmLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  if (state?.ok) return <Alert kind="ok">{state.ok}</Alert>;
  if (disabled) {
    return (
      <span className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {disabledReason}
      </span>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn danger sm" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={formAction} className="confirm-inline" role="group" aria-label={question}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span>{question}</span>
      <SubmitButton variant="danger" sm pendingLabel="מבצעים…">{confirmLabel}</SubmitButton>
      <button type="button" className="btn quiet sm" onClick={() => setOpen(false)}>
        לא, השאר
      </button>
      {state?.error ? <span style={{ flexBasis: "100%" }}>{state.error}</span> : null}
    </form>
  );
}
