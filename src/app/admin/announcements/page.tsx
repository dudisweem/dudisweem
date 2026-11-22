import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/domain/format";
import { Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { createAnnouncement, deleteAnnouncement, updateAnnouncement } from "./actions";

export const metadata: Metadata = { title: "הודעות להורים" };

type Ann = { id: string; title: string; body: string; active: boolean; created_at: string };

function Fields({ a }: { a?: Ann }) {
  const k = a?.id ?? "new";
  return (
    <>
      <div className="field"><label htmlFor={`t-${k}`}>כותרת</label><input className="inp" id={`t-${k}`} name="title" required minLength={2} maxLength={120} defaultValue={a?.title} placeholder="למשל: הבריכה סגורה ביום שישי" /></div>
      <div className="field"><label htmlFor={`b-${k}`}>תוכן</label><textarea className="inp" id={`b-${k}`} name="body" maxLength={2000} defaultValue={a?.body} /></div>
      <label className="toggle"><span className="col"><b>מוצגת להורים</b></span><input type="checkbox" name="active" defaultChecked={a ? a.active : true} /></label>
    </>
  );
}

export default async function AnnouncementsPage({ searchParams }: PageProps<"/admin/announcements">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
  const list = (data ?? []) as Ann[];
  return (
    <Shell roles={["admin"]} head={<Head kicker="ניהול" title="הודעות להורים" />}>
      <Flash sp={sp} />
      <details className="surf" open>
        <summary><span className="row"><Icon name="plus" />הודעה חדשה</span></summary>
        <form action={createAnnouncement} className="pad stack">
          <Fields />
          <SubmitButton variant="primary">פרסום</SubmitButton>
        </form>
      </details>
      {list.length === 0 ? <div className="surf"><Empty icon="flag">אין הודעות. הודעה פעילה מופיעה בדף הבית של כל ההורים.</Empty></div> : null}
      {list.map((a) => (
        <details key={a.id} className="surf">
          <summary>
            <span className="col"><b>{a.title}</b><small className="muted">{fmtDate(a.created_at)}</small></span>
            <span className="acts-row">{a.active ? <Pill kind="ok">מוצגת</Pill> : <Pill kind="done">מוסתרת</Pill>}<Icon name="pen" small /></span>
          </summary>
          <form action={updateAnnouncement} className="pad stack">
            <input type="hidden" name="id" value={a.id} />
            <Fields a={a} />
            <SubmitButton variant="solid" sm>שמירה</SubmitButton>
          </form>
          <form action={deleteAnnouncement} className="acts-row" style={{ padding: "0 16px 16px" }}>
            <input type="hidden" name="id" value={a.id} />
            <ConfirmButton question="למחוק את ההודעה?" confirmLabel="מחיקה">מחיקה</ConfirmButton>
          </form>
        </details>
      ))}
    </Shell>
  );
}
