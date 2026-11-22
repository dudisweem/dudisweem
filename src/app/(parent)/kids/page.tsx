import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { ageFrom, healthValid } from "@/domain/format";
import { LEVEL_LABEL } from "@/domain/labels";
import { Avatar, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { creditsLeft, getMyCredits, getMyKids } from "../data";

export const metadata: Metadata = { title: "הילדים שלי" };

export default async function KidsPage() {
  const me = await requireRole("parent", "admin", "instructor");
  const [settings, kids, credits] = await Promise.all([getSettings(), getMyKids(me.id), getMyCredits()]);
  return (
    <Shell
      roles={["parent", "admin", "instructor"]}
      head={
        <Head kicker="חשבון משפחה" title="הילדים שלי">
          <div className="facts"><span><Icon name="kids" small />{kids.length ? `${kids.length} ילדים רשומים` : "עוד אין ילדים רשומים"}</span></div>
        </Head>
      }
    >
      <div className="sec-h">
        <h2>רשימת הילדים</h2>
        <Link href="/kids/new">+ רישום ילד</Link>
      </div>
      {kids.length === 0 ? (
        <div className="surf empty">
          <Icon name="kids" />
          <div>
            <b>עוד לא רשמתם ילדים</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>כל ילד מקבל כרטיס משלו: הצהרת בריאות, שיעורים וכרטיסייה.</p>
          </div>
          <Link className="btn solid" href="/kids/new"><Icon name="plus" />רישום ילד ראשון</Link>
        </div>
      ) : (
        <div className="surf list">
          {kids.map((k) => {
            const age = ageFrom(k.birth_date);
            const ok = healthValid(k.health_signed_at, settings.health_validity_months, settings.health_required);
            const c = creditsLeft(credits, k.id);
            return (
              <Link key={k.id} href={`/kids/${k.id}`} className="kidline">
                <span className="ribbonv" style={{ background: k.color }} />
                <Avatar name={k.first_name} color={k.color} size="l" />
                <span className="col grow">
                  <b>{k.first_name} {k.last_name}</b>
                  <small>
                    {[age !== null ? `גיל ${age}` : null, LEVEL_LABEL[k.swim_level], c.total ? `כרטיסייה ${c.left}/${c.total}` : null].filter(Boolean).join(" · ")}
                  </small>
                </span>
                {ok ? <Pill kind="ok">בריאות בתוקף</Pill> : <Pill kind="wait">חסרה הצהרה</Pill>}
                <Icon name="left" small />
              </Link>
            );
          })}
        </div>
      )}
      <Link className="btn ghost full" href="/kids/new"><Icon name="plus" />רישום ילד נוסף</Link>
    </Shell>
  );
}
