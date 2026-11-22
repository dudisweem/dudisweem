"use client";
import { useState } from "react";
import { Icon } from "@/ui/Icon";
import { fmtMoney } from "@/domain/format";

// Browsers can't open Bit/PayBox without a payment link issued by them (tested on Android:
// intent: and market://launch URLs are blocked or fall back to Play). So:
// - a configured payment link (PayBox share link / Bit business link) opens the app directly;
// - otherwise we never show a dead button: Bit copies the number, PayBox shows instructions.
const LABEL = { bit: "Bit", paybox: "PayBox" } as const;

export function PayNow({ method, amount, bitPhone, bitLink, payboxLink }: { method: "bit" | "paybox"; amount: number; bitPhone: string; bitLink: string; payboxLink: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const link = method === "bit" ? bitLink : payboxLink;
  const shekels = (amount / 100).toString();

  if (link) {
    return (
      <a className="btn primary full" href={link} target="_blank" rel="noopener noreferrer">
        <Icon name="wallet" />
        תשלום {fmtMoney(amount)} ב־{LABEL[method]}
      </a>
    );
  }

  if (method === "bit" && bitPhone) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(bitPhone);
        setCopied("ok");
      } catch {
        setCopied("fail");
      }
    };
    return (
      <div className="stack-s" style={{ width: "100%" }}>
        <button type="button" className="btn primary full" onClick={copy}>
          <Icon name={copied === "ok" ? "check" : "wallet"} />
          {copied === "ok" ? "המספר הועתק" : "העתקת מספר ה־Bit"}
        </button>
        <small className="muted" role="status">
          {copied === "ok" ? "עכשיו פתחו את Bit, הדביקו את המספר ושלחו " : "העבירו ב־Bit למספר "}
          <b dir="ltr" className="num">{bitPhone}</b> סך <b className="num">{shekels} ₪</b>.
        </small>
      </div>
    );
  }

  return (
    <small className="muted">
      תשלום של {shekels} ₪ ב־{LABEL[method]}. פרטי ההעברה יישלחו מבית הספר.
    </small>
  );
}
