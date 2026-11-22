import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, fmtDate, fmtTime, fmtShortDay, healthValid } from "@/domain/format";
import { LEVEL_LABEL, STATUS } from "@/domain/labels";
import { Avatar, Pill, Vessel, Alert } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { creditsLeft, firstName, getBookings, getInstructorNames, getMyCredits, getMyKids, greeting } from "../data";

export const metadata: Metadata = { title: "בית" };

export default async function ParentHome() {
  const me = await requireRole("parent", "admin", "instructor");
  const supabase = await createClient();
  const [settings, kids, credits, instructors, { data: announcements }] = await Promise.all([
    getSettings(),
    getMyKids(me.id),
    getMyCredits(),
    getInstructorNames(),
    supabase.from("announcements").select("id, title, body, created_at").eq("active", true).order("created_at", { ascending: false }).limit(3),
  ]);
  const bookings = await getBookings(kids.map((k) => k.id));
  const now = new Date();
  const upcoming = bookings.filter((b) => (b.status === "pending" || b.status === "approved") && new Date(b.starts_at) > now);
  const next = upcoming[0];
  const nextKid = next ? kids.find((k) => k.id === next.student_id) : undefined;
  const needHealth = kids.filter((k) => !healthValid(k.health_signed_at, settings.health_validity_months, settings.health_required));

  const head = next ? (
    <Head kicker={`${greeting()}, ${firstName(me.full_name) || "שלום"}`} title={`השיעור הבא של ${nextKid?.first_name ?? ""}`}>
      <div className="readout num">
        {fmtTime(next.starts_at)}
        <small>
          יום {fmtShortDay(next.starts_at)}
          <br />
          {fmtDate(next.starts_at)}
        </small>
      </div>
      <div className="facts">
        <span><Icon name="user" small />{instructors.get(next.instructor_id)?.name ?? "מדריך"}</span>
        <span><Icon name="clock" small />{next.service?.name} · {next.service?.duration_min} דק׳</span>
        {upcoming.length > 1 ? <span><Icon name="cal" small />ועוד {upcoming.length - 1} שיעורים קרובים</span> : null}
      </div>
      <div style={{ marginTop: 12 }}>
        {next.status === "approved" ? (
          <span className="pill p-ok-dark"><Icon name="check" />מאושר</span>
        ) : (
          <Pill kind="wait">{STATUS.pending.label}</Pill>
        )}
      </div>
    </Head>
  ) : (
    <Head kicker={`${greeting()}, ${firstName(me.full_name) || "שלום"}`} title={kids.length ? "אין שיעור מתוכנן כרגע" : "ברוכים הבאים"}>
      <p className="facts" style={{ margin: "8px 0 0" }}>
        {kids.length ? "בוחרים מועד פנוי ושולחים בקשה — זה לוקח פחות מדקה." : "נתחיל ברישום הילדים, ואז נזמין שיעור ראשון."}
      </p>
    </Head>
  );

  return (
    <Shell roles={["parent", "admin", "instructor"]} head={head}>
      {!settings.booking_open ? <Alert kind="wait">{settings.closed_message}</Alert> : null}

      {(announcements ?? []).map((a) => (
        <div key={a.id} className="surf pad lit row" style={{ alignItems: "flex-start" }}>
          <span className="av m" style={{ background: "var(--free-bg)", color: "var(--free)" }}><Icon name="flag" /></span>
          <span className="col grow">
            <b>{a.title}</b>
            {a.body ? <small style={{ whiteSpace: "pre-line" }}>{a.body}</small> : null}
          </span>
        </div>
      ))}

      {needHealth.map((k) => (
        <div key={k.id} className="surf pad row">
          <span className="av m" style={{ background: "var(--wait-bg)", color: "var(--wait)" }}><Icon name="heart" /></span>
          <span className="col grow">
            <b>הצהרת בריאות ל{k.first_name}</b>
            <small>{k.health_signed_at ? "ההצהרה פגה — צריך לחדש לפני הזמנה" : "נדרשת לפני הזמנת שיעור ראשון"}</small>
          </span>
          <Link className="btn quiet sm" href={`/kids/${k.id}/health`}>למילוי</Link>
        </div>
      ))}

      <div className="sec-h">
        <h2>הילדים שלי</h2>
        <Link href="/kids/new">רישום ילד נוסף</Link>
      </div>

      {kids.length === 0 ? (
        <div className="surf empty">
          <Icon name="kids" />
          <div>
            <b>עוד לא רשמתם ילדים</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>אפשר לרשום כמה ילדים בחשבון אחד ולנהל לכל אחד שיעורים והצהרת בריאות.</p>
          </div>
          <Link className="btn solid" href="/kids/new"><Icon name="plus" />רישום ילד</Link>
        </div>
      ) : (
        <div className="kidsrow">
          {kids.map((k) => {
            const c = creditsLeft(credits, k.id);
            const ok = healthValid(k.health_signed_at, settings.health_validity_months, settings.health_required);
            const age = ageFrom(k.birth_date);
            return (
              <Link key={k.id} href={`/kids/${k.id}`} className="kid surf">
                <span className="ribbon" style={{ background: k.color }} />
                <Avatar name={k.first_name} color={k.color} size="l" />
                <span className="col" style={{ justifyItems: "center" }}>
                  <b>{k.first_name}</b>
                  <small>{[age !== null ? `גיל ${age}` : null, LEVEL_LABEL[k.swim_level]].filter(Boolean).join(" · ")}</small>
                </span>
                {c.total > 0 ? (
                  <>
                    <Vessel level={Math.round((c.left / c.total) * 100)} label={`נותרו ${c.left} מתוך ${c.total} שיעורים`} />
                    <span className="big num">{c.left}/{c.total}<em>שיעורים בכרטיסייה</em></span>
                  </>
                ) : null}
                {ok ? <Pill kind="ok">בריאות בתוקף</Pill> : <Pill kind="wait">חסרה הצהרת בריאות</Pill>}
              </Link>
            );
          })}
        </div>
      )}

      {kids.length > 0 && settings.booking_open ? (
        <Link className="btn primary full" href="/book" style={{ minHeight: 56, fontSize: 17 }}>
          <Icon name="plus" />
          הזמנת שיעור
        </Link>
      ) : null}

      {upcoming.length > 0 ? (
        <>
          <div className="sec-h">
            <h2>שיעורים קרובים</h2>
            <Link href="/lessons">לכל השיעורים</Link>
          </div>
          <div className="surf list">
            {upcoming.slice(0, 4).map((b) => {
              const k = kids.find((x) => x.id === b.student_id);
              const s = STATUS[b.status];
              return (
                <div key={b.id} className="li">
                  <span className="tm num">{fmtTime(b.starts_at)}<small>{fmtShortDay(b.starts_at)} {fmtDate(b.starts_at).slice(0, -5)}</small></span>
                  <span className="col grow">
                    <b>{k?.first_name} · {b.service?.name}</b>
                    <small>{instructors.get(b.instructor_id)?.name ?? "מדריך"}</small>
                  </span>
                  <Pill kind={s.kind}>{s.label}</Pill>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </Shell>
  );
}
