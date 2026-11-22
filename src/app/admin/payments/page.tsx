import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDay, fmtDate, fmtMoney, fmtTime, localToUtc } from "@/domain/format";
import { PAYMENT_LABEL } from "@/domain/labels";
import { Empty, Pill, StatusPill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { BOOKING_SELECT, kidName, type AdminBooking } from "../_lib/queries";
import { Flash } from "../_lib/Flash";
import { setPaid } from "../actions";

export const metadata: Metadata = { title: "תשלומים" };

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  return { first, next };
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const sp = await searchParams;
  const ym = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : businessDay().slice(0, 7);
  const filter = typeof sp.filter === "string" && ["paid", "unpaid"].includes(sp.filter) ? sp.filter : "all";
  const { first, next } = monthBounds(ym);
  const supabase = await createClient();

  // unpaid filter spans all past months so nothing open is hidden; month view otherwise
  let q = supabase.from("bookings").select(BOOKING_SELECT).in("status", ["approved", "completed", "no_show"]).order("starts_at", { ascending: false });
  if (filter === "unpaid") q = q.eq("paid", false).neq("payment_method", "card").lt("starts_at", localToUtc(addDays(businessDay(), 1), "00:00").toISOString());
  else q = q.gte("starts_at", localToUtc(first, "00:00").toISOString()).lt("starts_at", localToUtc(next, "00:00").toISOString());
  if (filter === "paid") q = q.eq("paid", true);
  const { data } = await q.limit(500);
  const rows = (data ?? []) as unknown as AdminBooking[];

  const cashLike = rows.filter((r) => r.payment_method !== "card");
  const paidSum = cashLike.filter((r) => r.paid).reduce((n, r) => n + r.price_agorot, 0);
  const openSum = cashLike.filter((r) => !r.paid).reduce((n, r) => n + r.price_agorot, 0);
  const byMethod = new Map<string, number>();
  for (const r of cashLike.filter((x) => x.paid)) byMethod.set(r.payment_method, (byMethod.get(r.payment_method) ?? 0) + r.price_agorot);
  const cardCount = rows.filter((r) => r.payment_method === "card").length;
  const [yy, mm] = ym.split("-").map(Number);
  const link = (o: Record<string, string>) => `/admin/payments?${new URLSearchParams({ month: ym, filter, ...o }).toString()}`;
  const back = link({});

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="ניהול" title={filter === "unpaid" ? "תשלומים פתוחים" : `תשלומים · ${MONTHS[mm! - 1]} ${yy}`}>
          <div className="facts">
            <span><Icon name="check" small />שולם {fmtMoney(paidSum)}</span>
            <span><Icon name="clock" small />פתוח {fmtMoney(openSum)}</span>
          </div>
        </Head>
      }
    >
      <Flash sp={sp} />
      <div className="calbar">
        {filter !== "unpaid" ? (
          <div className="week-nav">
            <Link className="iconbtn" href={link({ month: shiftMonth(ym, 1) })} aria-label="החודש הבא"><Icon name="right" /></Link>
            <Link className="btn quiet sm" href={link({ month: businessDay().slice(0, 7) })}>החודש</Link>
            <Link className="iconbtn" href={link({ month: shiftMonth(ym, -1) })} aria-label="החודש הקודם"><Icon name="left" /></Link>
          </div>
        ) : <span />}
        <nav className="subnav" aria-label="סינון">
          <Link href={link({ filter: "all" })} aria-current={filter === "all" ? "page" : undefined}>הכל</Link>
          <Link href={link({ filter: "unpaid" })} aria-current={filter === "unpaid" ? "page" : undefined}>לא שולם</Link>
          <Link href={link({ filter: "paid" })} aria-current={filter === "paid" ? "page" : undefined}>שולם</Link>
        </nav>
      </div>

      <div className="cols3">
        <div className="surf pad stack-s"><span className="small muted">התקבל</span><b className="money-big num">{fmtMoney(paidSum)}</b></div>
        <div className="surf pad stack-s"><span className="small muted">פתוח לגבייה</span><b className="money-big num" style={{ color: openSum ? "var(--wait)" : undefined }}>{fmtMoney(openSum)}</b></div>
        <div className="surf pad stack-s">
          <span className="small muted">לפי אמצעי</span>
          {byMethod.size === 0 ? <span className="muted">—</span> : [...byMethod.entries()].map(([m, v]) => (
            <div key={m} className="row"><span className="grow">{PAYMENT_LABEL[m as keyof typeof PAYMENT_LABEL]}</span><b className="num">{fmtMoney(v)}</b></div>
          ))}
          {cardCount ? <div className="row"><span className="grow">מכרטיסייה</span><b className="num">{cardCount} שיעורים</b></div> : null}
        </div>
      </div>

      <div className="surf scroll-x">
        {rows.length === 0 ? (
          <Empty icon="wallet">{filter === "unpaid" ? "אין תשלומים פתוחים." : "אין שיעורים בתקופה הזו."}</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>תאריך</th><th>תלמיד</th><th>שיעור</th><th>סטטוס</th><th>אמצעי</th><th>סכום</th><th>תשלום</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num">{fmtDate(r.starts_at)} {fmtTime(r.starts_at)}</td>
                  <td><Link className="link" href={`/admin/bookings/${r.id}`}>{kidName(r)}</Link><div className="small muted">{r.student?.parent?.full_name}</div></td>
                  <td>{r.service?.name}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td>{PAYMENT_LABEL[r.payment_method]}</td>
                  <td className="num">{r.payment_method === "card" ? "—" : fmtMoney(r.price_agorot)}</td>
                  <td>
                    {r.payment_method === "card" ? (
                      <Pill kind="free">כרטיסייה</Pill>
                    ) : (
                      <form action={setPaid}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="paid" value={r.paid ? "false" : "true"} />
                        <SubmitButton variant={r.paid ? "quiet" : "primary"} sm pendingLabel="…" aria-label={r.paid ? "ביטול סימון תשלום" : "סימון ששולם"}>
                          {r.paid ? <><Icon name="check" small />שולם</> : "סמן ששולם"}
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
