"use client";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/ui/Icon";
import { fmtMoney } from "@/domain/format";

// Neither Bit nor PayBox publish a deep link that pre-fills a private transfer.
// Best effort: a configured payment link wins; otherwise on Android we launch the app
// by package (Chrome intent URL, falling back to Google Play if it isn't installed);
// on iPhone/desktop we copy the number and show exact instructions.
const APPS = {
  bit: { label: "Bit", pkg: "com.bnhp.payments.paymentsapp", play: "bit ביט" },
  paybox: { label: "PayBox", pkg: "com.payboxapp", play: "PayBox" },
} as const;

function intentUrl(pkg: string, playQuery: string) {
  const fallback = encodeURIComponent(`https://play.google.com/store/search?q=${encodeURIComponent(playQuery)}&c=apps`);
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};S.browser_fallback_url=${fallback};end`;
}

const subscribe = () => () => {};
const isAndroidNow = () => /android/i.test(navigator.userAgent);

export function PayNow({ method, amount, bitPhone, bitLink, payboxLink }: { method: "bit" | "paybox"; amount: number; bitPhone: string; bitLink: string; payboxLink: string }) {
  const [copied, setCopied] = useState(false);
  const android = useSyncExternalStore(subscribe, isAndroidNow, () => false);
  const app = APPS[method];
  const link = method === "bit" ? bitLink : payboxLink;
  const shekels = (amount / 100).toString();

  if (link) {
    return (
      <a className="btn primary full" href={link} target="_blank" rel="noopener noreferrer">
        <Icon name="wallet" />
        תשלום {fmtMoney(amount)} ב־{app.label}
      </a>
    );
  }

  const open = async () => {
    if (bitPhone && method === "bit") {
      try {
        await navigator.clipboard.writeText(bitPhone);
        setCopied(true);
      } catch {
        // clipboard blocked: number stays visible below
      }
    }
    if (android) window.location.href = intentUrl(app.pkg, app.play);
  };

  return (
    <div className="stack-s" style={{ width: "100%" }}>
      <button type="button" className="btn primary full" onClick={open}>
        <Icon name="wallet" />
        {android ? `פתיחת ${app.label} · ${fmtMoney(amount)}` : method === "bit" && bitPhone ? "העתקת מספר ה־Bit" : `תשלום ב־${app.label}`}
      </button>
      <small className="muted">
        {copied ? "המספר הועתק. " : ""}
        {method === "bit" && bitPhone ? (
          <>
            ב־Bit: העברה למספר <b dir="ltr" className="num">{bitPhone}</b> בסך <b className="num">{shekels} ₪</b>.
          </>
        ) : (
          <>פתחו את {app.label} ושלחו {shekels} ₪. פרטי ההעברה יישלחו מבית הספר.</>
        )}
        {!android ? ` באייפון: פתחו את אפליקציית ${app.label} ידנית.` : ""}
      </small>
    </div>
  );
}
