import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtTime } from "@/domain/format";
import { Alert, Empty, Pill } from "@/ui/primitives";
import { Icon, type IconName } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "התראות" };

type N = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

const KIND_ICON: Record<string, IconName> = {
  request_new: "inbox",
  booking_approved: "check",
  booking_declined: "x",
  booking_cancelled: "x",
  booking_cancelled_parent: "x",
  reminder: "clock",
  waitlist_open: "flag",
};

export default async function NotificationsPage() {
  const me = await requireRole("parent", "instructor", "admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as N[];
  const unread = rows.filter((r) => !r.read_at).length;

  // admins: honest email delivery state
  type MailStatus = { configured: boolean; queued: number; failed: number; sent: number; last_error: string | null };
  let mail: MailStatus | null = null;
  if (me.role === "admin") {
    const { data: st } = await supabase.rpc("email_status");
    if (st && !(st as { error?: string }).error) mail = st as MailStatus;
  }

  return (
    <Shell
      roles={["parent", "instructor", "admin"]}
      head={
        <Head kicker="עדכונים על השיעורים" title="התראות">
          <div className="facts">
            <span><Icon name="bell" small />{unread ? `${unread} חדשות` : "הכל נקרא"}</span>
          </div>
        </Head>
      }
    >
      {mail ? (
        mail.configured ? (
          <Alert kind={mail.failed ? "wait" : "info"}>
            מיילים: {mail.sent} נשלחו · {mail.queued} בתור · {mail.failed} נכשלו
            {mail.last_error ? ` · שגיאה אחרונה: ${mail.last_error.slice(0, 120)}` : ""}
          </Alert>
        ) : (
          <Alert kind="wait">
            שליחת מיילים עדיין לא מחוברת — ההתראות מופיעות כאן באתר, ו־{mail.queued} מיילים ממתינים בתור עד שיחובר שירות דוא״ל.
          </Alert>
        )
      ) : null}

      {unread ? (
        <form action={markAllRead} style={{ justifySelf: "start" }}>
          <SubmitButton variant="quiet" sm pendingLabel="מסמנים…"><Icon name="check" small />סימון הכל כנקרא</SubmitButton>
        </form>
      ) : null}

      <div className="surf list">
        {rows.length === 0 ? (
          <Empty icon="bell">אין התראות עדיין. כאן יופיעו אישורים, ביטולים ותזכורות.</Empty>
        ) : (
          rows.map((n) => (
            <form key={n.id} action={openNotification}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="link" value={n.link ?? "/notifications"} />
              <button type="submit" className={`notif${n.read_at ? "" : " unread"}`}>
                <span className={`dotu${n.read_at ? " read" : ""}`} aria-hidden="true" />
                <Icon name={KIND_ICON[n.kind] ?? "bell"} />
                <span className="col grow">
                  <b>{n.title}</b>
                  {n.body ? <small>{n.body}</small> : null}
                  <small className="num">{fmtDate(n.created_at)} · {fmtTime(n.created_at)}</small>
                </span>
                {!n.read_at ? <Pill kind="live">חדש</Pill> : null}
              </button>
            </form>
          ))
        )}
      </div>
    </Shell>
  );
}
