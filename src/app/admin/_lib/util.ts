import "server-only";
import { redirect } from "next/navigation";
import { addDays, businessDay, localToUtc } from "@/domain/format";

/** Return path from a hidden "back" field, restricted to /admin pages. */
export function backPath(fd: FormData, fallback: string) {
  const b = fd.get("back");
  return typeof b === "string" && b.startsWith("/admin") && !b.includes("//") ? b : fallback;
}

/** Redirect back with a flash message in the query string (err code or ok text key). */
export function flash(path: string, kind: "err" | "ok", value: string): never {
  const [base, query = ""] = path.split("?");
  const qs = new URLSearchParams(query);
  qs.delete("err");
  qs.delete("ok");
  qs.set(kind, value);
  redirect(`${base}?${qs.toString()}`);
}

/** Map an RPC response ({ok}|{error}) or Supabase error into a flash redirect. */
export function rpcOutcome(
  path: string,
  res: { data: unknown; error: { message?: string } | null },
  okKey: string,
): never {
  if (res.error) flash(path, "err", "unknown");
  const d = res.data as { ok?: boolean; error?: string } | null;
  if (d && d.error) flash(path, "err", d.error);
  flash(path, "ok", okKey);
}

export function dayRangeUtc(day: string) {
  return { from: localToUtc(day, "00:00").toISOString(), to: localToUtc(addDays(day, 1), "00:00").toISOString() };
}

export function today() {
  return businessDay();
}

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
export function bool(fd: FormData, k: string) {
  return fd.get(k) === "on" || fd.get(k) === "true";
}

/** Current time for server components (kept out of render bodies for the purity lint). */
export function nowMs() {
  return Date.now();
}
