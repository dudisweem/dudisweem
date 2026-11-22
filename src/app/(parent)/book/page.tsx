import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, addDays, businessDay, healthValid } from "@/domain/format";
import { LEVEL_LABEL } from "@/domain/labels";
import { AppShell } from "@/ui/AppShell";
import { Head } from "@/ui/Shell";
import { Alert } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { BookingFlow, type FlowKid, type FlowService } from "@/ui/parent/BookingFlow";
import { creditsLeft, getInstructorNames, getMyCredits, getMyKids } from "../data";

export const metadata: Metadata = { title: "הזמנת שיעור" };

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const sp = await searchParams;
  const me = await requireRole("parent", "admin", "instructor");
  const supabase = await createClient();
  const [settings, kids, credits, instructors, { data: services }] = await Promise.all([
    getSettings(),
    getMyKids(me.id),
    getMyCredits(),
    getInstructorNames(),
    supabase
      .from("services")
      .select("id, name, description, duration_min, price_agorot, capacity, min_age, max_age")
      .eq("active", true)
      .eq("bookable_by_parents", true)
      .order("sort"),
  ]);

  const shell = (head: React.ReactNode, body: React.ReactNode) => (
    <AppShell role={me.role} name={me.full_name || me.email} head={head}>
      {body}
    </AppShell>
  );

  if (!settings.booking_open) {
    return shell(<Head kicker="הזמנת שיעור" title="ההרשמה סגורה כרגע" />, <Alert kind="wait">{settings.closed_message}</Alert>);
  }
  if (kids.length === 0) {
    return shell(
      <Head kicker="הזמנת שיעור" title="קודם רושמים ילד" />,
      <div className="surf empty">
        <Icon name="kids" />
        <div>כדי להזמין שיעור צריך לרשום לפחות ילד אחד.</div>
        <Link className="btn solid" href="/kids/new"><Icon name="plus" />רישום ילד</Link>
      </div>,
    );
  }

  const flowKids: FlowKid[] = kids.map((k) => ({
    id: k.id,
    name: `${k.first_name} ${k.last_name}`.trim(),
    first: k.first_name,
    color: k.color,
    sub: [ageFrom(k.birth_date) !== null ? `גיל ${ageFrom(k.birth_date)}` : null, LEVEL_LABEL[k.swim_level]].filter(Boolean).join(" · "),
    age: ageFrom(k.birth_date),
    healthOk: healthValid(k.health_signed_at, settings.health_validity_months, settings.health_required),
    creditsByService: Object.fromEntries((services ?? []).map((s) => [s.id, creditsLeft(credits, k.id, s.id)])),
  }));
  const flowServices: FlowService[] = (services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    duration: s.duration_min,
    price: s.price_agorot,
    capacity: s.capacity,
    minAge: s.min_age,
    maxAge: s.max_age,
  }));
  const today = businessDay();
  const days = Array.from({ length: settings.booking_horizon_days + 1 }, (_, i) => addDays(today, i));
  const payments = (["card", "bit", "paybox", "cash"] as const).filter((p) => settings[`payment_${p}`]);
  const kidParam = typeof sp.kid === "string" ? sp.kid : null;

  return (
    <BookingFlow
      role={me.role}
      name={me.full_name || me.email}
      kids={flowKids}
      services={flowServices}
      instructors={[...instructors.entries()].map(([id, v]) => ({ id, name: v.name }))}
      days={days}
      payments={[...payments]}
      cancellationHours={settings.cancellation_hours}
      requireApproval={settings.require_approval}
      bitPhone={settings.bit_phone}
      payboxLink={settings.paybox_link}
      initialKid={flowKids.some((k) => k.id === kidParam && k.healthOk) ? kidParam : null}
    />
  );
}
