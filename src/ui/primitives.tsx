import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { STATUS, type BookingStatus } from "@/domain/labels";

type PillKind = "ok" | "wait" | "bad" | "done" | "free" | "live";
const PILL_ICON: Record<PillKind, IconName> = {
  ok: "check",
  wait: "clock",
  bad: "x",
  done: "check",
  free: "plus",
  live: "waves",
};

/** Status is always word + icon, never colour alone. */
export function Pill({ kind, children }: { kind: PillKind; children: ReactNode }) {
  return (
    <span className={`pill p-${kind}`}>
      <Icon name={PILL_ICON[kind]} />
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: BookingStatus }) {
  const s = STATUS[status];
  return <Pill kind={s.kind}>{s.label}</Pill>;
}

export function Wave() {
  return (
    <div className="wave" aria-hidden="true">
      <svg className="b" viewBox="0 0 200 20" preserveAspectRatio="none">
        <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z" fill="#EAF3F8" />
      </svg>
      <svg viewBox="0 0 200 20" preserveAspectRatio="none">
        <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z" fill="#EAF3F8" />
      </svg>
    </div>
  );
}

/** The waterline: every quantity is a water level. */
export function Vessel({ level, label, size, reserved }: { level: number; label: string; size?: "sm" | "xs" | "wide"; reserved?: number }) {
  const pct = Math.max(0, Math.min(100, level));
  return (
    <div className={`vessel ${size ?? ""} ${pct === 0 ? "empty" : ""}`} role="img" aria-label={label}>
      {reserved ? <div className="rsv" style={{ height: `${Math.min(100, reserved)}%`, bottom: `${pct}%` }} /> : null}
      <div className="lvl" style={size === "wide" ? { width: `${pct}%` } : { height: `${pct}%` }}>
        <svg viewBox="0 0 200 20" preserveAspectRatio="none">
          <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z" />
        </svg>
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = "m" }: { name: string; color: string; size?: "m" | "l" | "xl" }) {
  const letter = (name || "?").trim().charAt(0);
  return (
    <span className={`av ${size}`} style={{ background: color }} aria-hidden="true">
      {letter}
    </span>
  );
}

export function Empty({ icon = "waves", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Alert({ kind, children }: { kind: "bad" | "ok" | "wait" | "info"; children: ReactNode }) {
  const icon: IconName = kind === "ok" ? "check" : kind === "info" ? "flag" : "alert";
  return (
    <div className={`alert ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}
