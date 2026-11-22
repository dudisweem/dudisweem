// Pure helpers: business time (Asia/Jerusalem) and money (integer agorot). No I/O.
export const BUSINESS_TZ = "Asia/Jerusalem";

const dateFmt = new Intl.DateTimeFormat("he-IL", { timeZone: BUSINESS_TZ, day: "numeric", month: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("he-IL", { timeZone: BUSINESS_TZ, weekday: "long" });
const shortDayFmt = new Intl.DateTimeFormat("he-IL", { timeZone: BUSINESS_TZ, weekday: "short" });
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

export function fmtDate(d: Date | string) {
  return dateFmt.format(new Date(d)).replace(/\//g, ".");
}
export function fmtTime(d: Date | string) {
  return timeFmt.format(new Date(d));
}
export function fmtWeekday(d: Date | string) {
  return weekdayFmt.format(new Date(d));
}
export function fmtShortDay(d: Date | string) {
  return shortDayFmt.format(new Date(d));
}
/** YYYY-MM-DD of the instant in business time */
export function businessDay(d: Date | string = new Date()) {
  return isoDayFmt.format(new Date(d));
}
/** add days to a YYYY-MM-DD string (calendar math, tz-agnostic) */
export function addDays(day: string, n: number) {
  const [y, m, dd] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, dd! + n));
  return t.toISOString().slice(0, 10);
}
/** 0=Sunday for a YYYY-MM-DD */
export function weekdayOf(day: string) {
  const [y, m, dd] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd!)).getUTCDay();
}
export function weekStart(day: string) {
  return addDays(day, -weekdayOf(day));
}
/** day-of-month number for a YYYY-MM-DD */
export function dayNum(day: string) {
  return Number(day.slice(8, 10));
}
export function fmtDayLabel(day: string) {
  const [y, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** Convert a business-local wall time (YYYY-MM-DD + HH:mm) to a UTC Date, DST-correct. */
export function localToUtc(day: string, hhmm: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const offset = tzOffsetMinutes(new Date(guess));
  let utc = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(new Date(utc));
  if (offset2 !== offset) utc = guess - offset2 * 60_000;
  return new Date(utc);
}
function tzOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// ---------------------------------------------------------------- money
export function fmtMoney(agorot: number) {
  const shekels = agorot / 100;
  const s = new Intl.NumberFormat("he-IL", { minimumFractionDigits: agorot % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(shekels);
  return `${s} ₪`;
}
/** "200" | "199.9" → agorot; null when invalid (negative, >2 decimals, not a number) */
export function parseShekel(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// ---------------------------------------------------------------- policy
export function canParentCancel(startsAt: Date, now: Date, hours: number) {
  return startsAt.getTime() - now.getTime() >= hours * 3_600_000;
}

export function ageFrom(birth: string | null, now = new Date()) {
  if (!birth) return null;
  const b = new Date(birth);
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

export function healthValid(signedAt: string | null, validityMonths: number, required: boolean, at = new Date()) {
  if (!required) return true;
  if (!signedAt) return false;
  const s = new Date(signedAt);
  const exp = new Date(s);
  exp.setMonth(exp.getMonth() + validityMonths);
  return exp > at;
}
