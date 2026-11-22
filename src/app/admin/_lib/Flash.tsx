import { Alert } from "@/ui/primitives";
import { errorText } from "@/domain/labels";

const OK_TEXT: Record<string, string> = {
  approved: "הבקשה אושרה.",
  declined: "הבקשה נדחתה.",
  completed: "סומן שהשיעור התקיים.",
  no_show: "סומן שהחניך לא הגיע.",
  cancelled: "השיעור בוטל.",
  paid: "התשלום עודכן.",
  saved: "השינויים נשמרו.",
  created: "נוצר בהצלחה.",
  deleted: "נמחק.",
  booked: "השיעור נקבע ואושר.",
  role: "התפקיד עודכן.",
  active: "סטטוס המשתמש עודכן.",
  user_deleted: "המשתמש נמחק לצמיתות.",
  reset_sent: "נשלח מייל עם קישור לאיפוס סיסמה.",
};

const LOCAL_ERR: Record<string, string> = {
  invalid: "יש שדה חסר או לא תקין. בדקו את הערכים ונסו שוב.",
  no_payment: "צריך להשאיר לפחות אמצעי תשלום אחד פעיל.",
  in_use: "אי אפשר למחוק — יש שיעורים שמשויכים לזה. אפשר להפוך ללא פעיל.",
  has_lessons: "למדריך יש שיעורים במערכת ולכן אי אפשר למחוק אותו. אפשר להשהות את החשבון במקום.",
  cannot_delete_self: "אי אפשר למחוק את החשבון שלך.",
  rate_limited: "נשלחו יותר מדי מיילים. נסו שוב בעוד כמה דקות.",
  time_order: "שעת הסיום חייבת להיות אחרי שעת ההתחלה.",
};

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const err = typeof sp.err === "string" ? sp.err : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  if (err) return <Alert kind="bad">{LOCAL_ERR[err] ?? errorText(err)}</Alert>;
  if (ok) return <Alert kind="ok">{OK_TEXT[ok] ?? "בוצע."}</Alert>;
  return null;
}
