export type BookingStatus = "pending" | "approved" | "declined" | "cancelled" | "completed" | "no_show";
export type Role = "admin" | "instructor" | "parent";
export type Payment = "cash" | "bit" | "paybox" | "card";

export const STATUS: Record<BookingStatus, { label: string; kind: "ok" | "wait" | "bad" | "done" | "free" | "live" }> = {
  pending: { label: "ממתין לאישור", kind: "wait" },
  approved: { label: "מאושר", kind: "ok" },
  declined: { label: "נדחה", kind: "bad" },
  cancelled: { label: "בוטל", kind: "done" },
  completed: { label: "התקיים", kind: "done" },
  no_show: { label: "לא הגיע", kind: "bad" },
};

export const ROLE_LABEL: Record<Role, string> = { admin: "מנהל", instructor: "מדריך", parent: "הורה" };

export const PAYMENT_LABEL: Record<Payment, string> = {
  cash: "מזומן",
  bit: "Bit",
  paybox: "PayBox",
  card: "כרטיסייה",
};

export const LEVEL_LABEL: Record<string, string> = {
  none: "לא שוחה",
  beginner: "מתחיל",
  basic: "בסיסי",
  intermediate: "בינוני",
  advanced: "מתקדם",
};

export const ERROR_TEXT: Record<string, string> = {
  not_found: "לא נמצא. ייתכן שאין הרשאה לפעולה הזו.",
  not_authenticated: "צריך להתחבר מחדש.",
  booking_closed: "ההרשמה לשיעורים סגורה כרגע.",
  health_required: "חסרה הצהרת בריאות בתוקף לילד הזה.",
  payment_not_allowed: "אמצעי התשלום הזה לא זמין.",
  slot_taken: "המועד הזה נתפס הרגע. בחרו מועד אחר.",
  weekly_limit: "הגעתם למספר השיעורים המרבי לשבוע.",
  no_credit: "אין יתרה בכרטיסייה לשיעור הזה.",
  overlap_student: "לילד כבר יש שיעור בזמן הזה.",
  not_active: "השיעור כבר לא פעיל.",
  too_late_to_cancel: "אי אפשר לבטל בשלב הזה. לביטול מאוחר צרו קשר עם דודי.",
  not_pending: "הבקשה כבר טופלה.",
  not_approved: "השיעור לא מאושר.",
  not_started: "השיעור עוד לא התחיל.",
  owner_locked: "אי אפשר לשנות את בעל המערכת.",
  bad_role: "תפקיד לא תקין.",
  name_required: "צריך לחתום בשם מלא.",
  unknown: "משהו השתבש. נסו שוב.",
};

export function errorText(code?: string | null) {
  return (code && ERROR_TEXT[code]) || ERROR_TEXT.unknown!;
}

export const KID_COLORS = ["#5DB4DA", "#FF8A65", "#7BC67E", "#B39DDB", "#F6C453", "#4DB6AC", "#F48FB1"];
