"use client";
import { useEffect } from "react";

/**
 * Site-wide form behaviour (mounted once in the root layout):
 * 1. Before submit, finds every missing/invalid field, marks its title red with a short
 *    message, and scrolls + focuses the first one. The submit never reaches the server.
 * 2. Keeps what the user already typed: React 19 resets a form after its action runs,
 *    which wiped every field when the server answered with an error. We cancel that
 *    reset (forms that really want it can opt in with data-allow-reset).
 */
const CONTAINER = ".field, fieldset, .ck, .q";

function messageFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const v = el.validity;
  if (v.valueMissing) {
    if (el instanceof HTMLInputElement && el.type === "checkbox") return "צריך לסמן כדי להמשיך";
    if (el instanceof HTMLInputElement && el.type === "radio") return "צריך לבחור תשובה";
    return "שדה חובה";
  }
  if (v.typeMismatch) return el.type === "email" ? "כתובת מייל לא תקינה" : "ערך לא תקין";
  if (v.tooShort) return `לפחות ${(el as HTMLInputElement).minLength} תווים`;
  if (v.rangeUnderflow || v.rangeOverflow) return "הערך מחוץ לטווח";
  if (v.patternMismatch) return "פורמט לא תקין";
  return "צריך לתקן את השדה";
}

function clearMark(container: Element) {
  container.classList.remove("invalid");
  container.querySelectorAll(":scope > .guard-msg, :scope .guard-msg").forEach((m) => m.remove());
  container.querySelectorAll("[aria-invalid='true']").forEach((i) => i.removeAttribute("aria-invalid"));
}

function mark(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  el.setAttribute("aria-invalid", "true");
  const container = el.closest(CONTAINER) ?? el.parentElement;
  if (!container || container.classList.contains("invalid")) return;
  container.classList.add("invalid");
  const msg = document.createElement("span");
  msg.className = "guard-msg";
  msg.setAttribute("role", "alert");
  msg.textContent = messageFor(el);
  container.appendChild(msg);
}

export function FormGuard() {
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.noGuard !== undefined) return;
      form.querySelectorAll(".invalid").forEach(clearMark);

      let first: HTMLElement | null = null;
      for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
        if (!el.willValidate || el.checkValidity()) continue;
        mark(el);
        first ??= el;
      }
      if (!first) return;
      // capture phase on window runs before React's handler: stop the action entirely
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = (first.closest(CONTAINER) as HTMLElement | null) ?? first;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      first.focus({ preventScroll: true });
    };

    const onEdit = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      const container = el.closest(".invalid");
      if (!container) return;
      // a radio group is fixed once any option is chosen
      const fixed = el.type === "radio" ? true : el.checkValidity();
      if (fixed) clearMark(container);
    };

    const onReset = (e: Event) => {
      const form = e.target;
      if (form instanceof HTMLFormElement && form.dataset.allowReset === undefined) e.preventDefault();
    };

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("input", onEdit, true);
    window.addEventListener("change", onEdit, true);
    window.addEventListener("reset", onReset, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("input", onEdit, true);
      window.removeEventListener("change", onEdit, true);
      window.removeEventListener("reset", onReset, true);
    };
  }, []);
  return null;
}
