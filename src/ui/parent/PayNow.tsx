"use client";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/ui/Icon";
import { fmtMoney } from "@/domain/format";

// Opening the parent's own payment app from a web page:
// - Bit registers native schemes (unofficial, reported by integrators): Android scheme "bit"
//   on package com.bnhp.payments.paymentsapp, iOS "paymentsBIT://". These open Bit itself;
//   no public format pre-fills the payee/amount, so we copy the number first.
// - PayBox publishes no scheme or app links (payboxapp.com has no assetlinks), so only a
//   PayBox share link opens it.
// - A configured payment link (PayBox share link / Bit business link) always wins.
const LABEL = { bit: "Bit", paybox: "PayBox" } as const;
const BIT_ANDROID = "intent://open#Intent;scheme=bit;package=com.bnhp.payments.paymentsapp;end";
const BIT_IOS = "paymentsBIT://";

type Platform = "android" | "ios" | "other";
const subscribe = () => () => {};
function platformNow(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

export function PayNow({ method, amount, bitPhone, bitLink, payboxLink }: { method: "bit" | "paybox"; amount: number; bitPhone: string; bitLink: string; payboxLink: string }) {
  const [copied, setCopied] = useState(false);
  const platform = useSyncExternalStore(subscribe, platformNow, () => "other" as Platform);
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

  if (method === "bit") {
    const canOpen = platform !== "other";
    const open = () => {
      // keep the tap's user activation: start the copy, then navigate synchronously
      if (bitPhone) {
        navigator.clipboard?.writeText(bitPhone).then(() => setCopied(true), () => setCopied(false));
      }
      if (platform === "android") window.location.href = BIT_ANDROID;
      else if (platform === "ios") window.location.href = BIT_IOS;
    };
    return (
      <div className="stack-s" style={{ width: "100%" }}>
        {canOpen || bitPhone ? (
          <button type="button" className="btn primary full" onClick={open}>
            <Icon name="wallet" />
            {canOpen ? `פתיחת Bit · ${fmtMoney(amount)}` : "העתקת מספר ה־Bit"}
          </button>
        ) : null}
        <small className="muted" role="status">
          {copied ? "המספר הועתק. " : ""}
          {bitPhone ? (
            <>
              העבירו ב־Bit למספר <b dir="ltr" className="num">{bitPhone}</b> סך <b className="num">{shekels} ₪</b>.
            </>
          ) : (
            <>העבירו ב־Bit {shekels} ₪. פרטי ההעברה יישלחו מבית הספר.</>
          )}
        </small>
      </div>
    );
  }

  return (
    <small className="muted">
      תשלום של {shekels} ₪ ב־PayBox. פרטי ההעברה יישלחו מבית הספר.
    </small>
  );
}
