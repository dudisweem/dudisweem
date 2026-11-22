// Labels for instructor availability requests (shared by instructor and admin screens).
import { WEEKDAYS, fmtDate, fmtTime } from "./format";

export type AvailabilityKind = "add_hours" | "remove_hours" | "add_time_off" | "remove_time_off";

export const AVAIL_ERRORS: Record<string, string> = {
  has_lessons: "יש שיעורים מתוכננים בזמן הזה, לכן אי אפשר להסיר אותו. בטלו או העבירו את השיעורים קודם.",
  time_order: "שעת הסיום חייבת להיות אחרי שעת ההתחלה.",
  invalid: "יש שדה חסר או לא תקין.",
  not_found: "לא נמצא, או שאין הרשאה לשינוי הזה.",
  not_pending: "הבקשה כבר טופלה.",
  unknown: "משהו השתבש. נסו שוב.",
};

export const AVAIL_OK: Record<string, string> = {
  applied: "השינוי נשמר ונכנס ללוח.",
  requested: "הבקשה נשלחה למנהל לאישור.",
  cancelled: "הבקשה בוטלה.",
};

const t5 = (t: unknown) => String(t ?? "").slice(0, 5);

/** Human sentence for a request payload, e.g. "הוספת שעות: שני, רביעי 16:00–19:00". */
export function describeRequest(kind: AvailabilityKind, payload: Record<string, unknown>, lookup?: { hours?: Map<string, string>; off?: Map<string, string> }) {
  switch (kind) {
    case "add_hours": {
      const days = (Array.isArray(payload.weekdays) ? payload.weekdays : []).map((d) => WEEKDAYS[Number(d)] ?? "").filter(Boolean);
      return `הוספת שעות: ${days.join(", ")} ${t5(payload.start)}–${t5(payload.end)}`;
    }
    case "remove_hours":
      return `הסרת שעות: ${lookup?.hours?.get(String(payload.id)) ?? "טווח שעות קבוע"}`;
    case "add_time_off": {
      const s = new Date(String(payload.starts_at));
      const e = new Date(String(payload.ends_at));
      const reason = payload.reason ? ` · ${String(payload.reason)}` : "";
      return `חסימה: ${fmtDate(s)} ${fmtTime(s)} עד ${fmtDate(e)} ${fmtTime(e)}${reason}`;
    }
    case "remove_time_off":
      return `ביטול חסימה: ${lookup?.off?.get(String(payload.id)) ?? "חסימה קיימת"}`;
  }
}
