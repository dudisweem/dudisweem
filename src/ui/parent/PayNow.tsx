"use client";
import { useState } from "react";
import { Icon } from "@/ui/Icon";
import { fmtMoney } from "@/domain/format";

// Bit has no public deep link that pre-fills a person-to-person payment, so without a
// business payment link we copy the number + amount and open Bit's app link.
const BIT_APP = "https://www.bitpay.co.il/app/";

export function PayNow({ method, amount, bitPhone, bitLink, payboxLink }: { method: "bit" | "paybox"; amount: number; bitPhone: string; bitLink: string; payboxLink: string }) {
  const [copied, setCopied] = useState(false);
  const shekels = (amount / 100).toString();

  if (method === "paybox") {
    if (!payboxLink) return <small>פרטי PayBox יישלחו מהמנהל.</small>;
    return (
      <a className="btn primary full" href={payboxLink} target="_blank" rel="noopener noreferrer">
        <Icon name="wallet" />
        תשלום {fmtMoney(amount)} ב־PayBox
      </a>
    );
  }

  if (bitLink) {
    return (
      <a className="btn primary full" href={bitLink} target="_blank" rel="noopener noreferrer">
        <Icon name="wallet" />
        תשלום {fmtMoney(amount)} ב־Bit
      </a>
    );
  }
  if (!bitPhone) return <small>פרטי Bit יישלחו מהמנהל.</small>;

  const openBit = async () => {
    try {
      await navigator.clipboard.writeText(bitPhone);
      setCopied(true);
    } catch {
      // clipboard blocked: the number stays visible on screen
    }
    window.open(BIT_APP, "_blank", "noopener");
  };

  return (
    <div className="stack-s" style={{ width: "100%" }}>
      <button type="button" className="btn primary full" onClick={openBit}>
        <Icon name="wallet" />
        פתיחת Bit · {fmtMoney(amount)}
      </button>
      <small className="muted">
        {copied ? "המספר הועתק. " : ""}ב־Bit: העברה למספר <b dir="ltr" className="num">{bitPhone}</b> בסך <b className="num">{shekels} ₪</b>.
      </small>
    </div>
  );
}
