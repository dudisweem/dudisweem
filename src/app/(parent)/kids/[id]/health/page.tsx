import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, fmtDate } from "@/domain/format";
import { HealthForm } from "@/ui/parent/HealthForm";
import { Alert } from "@/ui/primitives";

export const metadata: Metadata = { title: "הצהרת בריאות" };

export default async function HealthPage({ params }: PageProps<"/kids/[id]/health">) {
  const { id } = await params;
  const me = await requireRole("parent", "admin", "instructor");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: kid } = await supabase
    .from("students")
    .select("id, parent_id, first_name, last_name, birth_date, color, health_signed_at")
    .eq("id", id)
    .eq("parent_id", me.id)
    .maybeSingle();
  if (!kid) notFound();
  const settings = await getSettings();
  const age = ageFrom(kid.birth_date);
  const until = new Date();
  until.setMonth(until.getMonth() + settings.health_validity_months);

  return (
    <Shell
      roles={["parent", "admin", "instructor"]}
      head={
        <>
          <span className="k"><Link href={`/kids/${kid.id}`} style={{ color: "inherit" }}>הצהרת בריאות</Link></span>
          <h1 className="row" style={{ gap: 12 }}>
            <span className="av l" style={{ background: kid.color }} aria-hidden="true">{kid.first_name.charAt(0)}</span>
            {kid.first_name} {kid.last_name}{age !== null ? `, גיל ${age}` : ""}
          </h1>
          <span className="k" style={{ marginTop: 6 }}>השאלון מתייחס ל{kid.first_name} בלבד. כל ילד מקבל הצהרה נפרדת.</span>
        </>
      }
    >
      {kid.health_signed_at ? (
        <Alert kind="info">הצהרה קודמת נחתמה ב־{fmtDate(kid.health_signed_at)}. חתימה חדשה תחליף אותה.</Alert>
      ) : null}
      <p className="hint" style={{ margin: "0 4px" }}>
        ההצהרה תהיה בתוקף {settings.health_validity_months} חודשים — עד {fmtDate(until)}. המידע גלוי רק לכם ולהנהלת בית הספר.
      </p>
      <HealthForm studentId={kid.id} kidName={kid.first_name} signerDefault={me.full_name} cancellationHours={settings.cancellation_hours} />
    </Shell>
  );
}
