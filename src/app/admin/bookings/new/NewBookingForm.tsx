"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addDays, dayNum, fmtShortDay, fmtTime, localToUtc } from "@/domain/format";
import { errorText, PAYMENT_LABEL, type Payment } from "@/domain/labels";
import { Alert } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { createBooking, loadSlots, type Slot } from "../../actions";

type Props = {
  students: { id: string; name: string; parent: string }[];
  services: { id: string; name: string; duration_min: number; capacity: number }[];
  staff: { id: string; full_name: string }[];
  payments: Payment[];
  today: string;
  initialStudent: string;
};

export function NewBookingForm({ students, services, staff, payments, today, initialStudent }: Props) {
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState(initialStudent);
  const [service, setService] = useState(services[0]?.id ?? "");
  const [instructor, setInstructor] = useState("");
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [payment, setPayment] = useState<Payment>(payments[0] ?? "cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(services[0]));
  const [sending, startSend] = useTransition();
  // one id per booking attempt: a retry after a network drop replays the same id, never a second booking
  const attempt = useRef<string>("");
  const reqKey = useRef("");

  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i)), [today]);
  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? students.filter((s) => s.name.includes(q) || s.parent.includes(q)) : students;
  }, [query, students]);

  /** Fetch slots; stale-response guard applies only the latest selection's result. */
  const fetchSlots = useCallback((svc: string, d: string, ins: string) => {
    const key = `${svc}|${d}|${ins}`;
    reqKey.current = key;
    loadSlots(svc, d, ins || null).then((s) => {
      if (reqKey.current !== key) return;
      setSlots(s);
      setLoading(false);
    });
  }, []);

  function select(next: { service?: string; day?: string; instructor?: string }) {
    const svc = next.service ?? service;
    const d = next.day ?? day;
    const ins = next.instructor ?? instructor;
    if (next.service !== undefined) setService(svc);
    if (next.day !== undefined) setDay(d);
    if (next.instructor !== undefined) setInstructor(ins);
    setSlot(null);
    setLoading(true);
    fetchSlots(svc, d, ins);
  }

  useEffect(() => {
    attempt.current = crypto.randomUUID();
    if (services[0]) fetchSlots(services[0].id, today, "");
  }, [fetchSlots, services, today]);

  function submit() {
    if (!student || !slot) return;
    setError(null);
    startSend(async () => {
      const res = await createBooking({
        attempt: attempt.current,
        student,
        service,
        instructor: slot.instructor_id,
        start: new Date(slot.starts_at).toISOString(),
        payment,
        note,
      });
      if (res.ok) setDone(res.id);
      else {
        setError(res.error);
        if (res.error === "slot_taken") {
          attempt.current = crypto.randomUUID();
          setSlot(null);
          fetchSlots(service, day, instructor);
        }
      }
    });
  }

  if (done) {
    return (
      <div className="surf success">
        <div className="drop"><div className="lvl" /><Icon name="check" /></div>
        <h2 style={{ margin: 0 }}>השיעור נקבע ואושר</h2>
        <div className="acts-row" style={{ justifyContent: "center" }}>
          <Link href={`/admin/bookings/${done}`} className="btn solid">לפרטי השיעור</Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              attempt.current = crypto.randomUUID();
              setDone(null);
              setSlot(null);
              setNote("");
              fetchSlots(service, day, instructor);
            }}
          >
            שיעור נוסף
          </button>
        </div>
      </div>
    );
  }

  const selectedStudent = students.find((s) => s.id === student);

  return (
    <div className="stack">
      <section className="surf pad stack-s" aria-labelledby="st-h">
        <h2 id="st-h" style={{ margin: 0, fontSize: 16 }}>1. תלמיד</h2>
        {selectedStudent ? (
          <div className="row">
            <span className="grow"><b>{selectedStudent.name}</b> <span className="muted small">· {selectedStudent.parent}</span></span>
            <button type="button" className="btn quiet sm" onClick={() => setStudent("")}>החלפה</button>
          </div>
        ) : (
          <>
            <div className="search">
              <Icon name="search" />
              <input className="inp" placeholder="חיפוש לפי שם ילד או הורה" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="חיפוש תלמיד" />
            </div>
            <div className="list" style={{ maxHeight: 260, overflow: "auto" }}>
              {filtered.length === 0 ? <p className="muted">לא נמצאו תלמידים.</p> : null}
              {filtered.slice(0, 50).map((s) => (
                <button key={s.id} type="button" className="srow" onClick={() => setStudent(s.id)}>
                  <span className="col grow"><b>{s.name}</b><small>{s.parent}</small></span>
                  <Icon name="left" small />
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="surf pad stack-s" aria-labelledby="sv-h">
        <h2 id="sv-h" style={{ margin: 0, fontSize: 16 }}>2. סוג שיעור ומדריך</h2>
        <div className="chips" role="group" aria-label="סוג שיעור">
          {services.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={service === s.id} onClick={() => select({ service: s.id })}>
              {s.name} · {s.duration_min}′
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="מדריך">
          <button type="button" className="chip" aria-pressed={!instructor} onClick={() => select({ instructor: "" })}>כל המדריכים</button>
          {staff.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={instructor === s.id} onClick={() => select({ instructor: s.id })}>
              {s.full_name || "ללא שם"}
            </button>
          ))}
        </div>
      </section>

      <section className="surf pad stack-s" aria-labelledby="dy-h">
        <h2 id="dy-h" style={{ margin: 0, fontSize: 16 }}>3. יום ושעה</h2>
        <div className="days" role="group" aria-label="יום">
          {days.map((d) => {
            const at = localToUtc(d, "12:00");
            return (
              <button key={d} type="button" className="day" aria-pressed={day === d} onClick={() => select({ day: d })}>
                {fmtShortDay(at)}
                <b className="num">{dayNum(d)}</b>
              </button>
            );
          })}
        </div>
        <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          תאריך אחר:
          <input type="date" className="inp sm" style={{ width: "auto" }} value={day} min={today} onChange={(e) => e.target.value && select({ day: e.target.value })} />
        </label>
        {loading ? (
          <p className="muted" aria-live="polite">טוענים שעות פנויות…</p>
        ) : slots && slots.length === 0 ? (
          <p className="muted" aria-live="polite">אין שעות פנויות ביום הזה. בדקו שעות עבודה וחסימות ב<Link className="link" href="/admin/schedule">לוח הזמנים</Link>.</p>
        ) : (
          <div className="slots" role="group" aria-label="שעה">
            {(slots ?? []).map((s) => {
              const k = `${s.starts_at}|${s.instructor_id}`;
              const sel = slot && `${slot.starts_at}|${slot.instructor_id}` === k;
              return (
                <button key={k} type="button" className="slot" aria-pressed={Boolean(sel)} onClick={() => setSlot(s)}>
                  <b className="num">{fmtTime(s.starts_at)}</b>
                  {s.instructor_name}
                  {services.find((x) => x.id === service)?.capacity !== 1 ? ` · ${s.spots_left} מקומות` : ""}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="surf pad stack-s" aria-labelledby="pm-h">
        <h2 id="pm-h" style={{ margin: 0, fontSize: 16 }}>4. תשלום והערה</h2>
        <div className="chips" role="group" aria-label="אמצעי תשלום">
          {payments.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={payment === p} onClick={() => setPayment(p)}>
              {PAYMENT_LABEL[p]}
            </button>
          ))}
        </div>
        <input className="inp" placeholder="הערה (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="הערה" />
      </section>

      {error ? <Alert kind="bad">{errorText(error)}</Alert> : null}

      <div className="stepper-foot" style={{ position: "static", padding: 0, background: "none" }}>
        <button type="button" className="btn primary" disabled={!student || !slot || sending} aria-busy={sending || undefined} onClick={submit}>
          {sending ? (<><span className="spin" aria-hidden="true" />קובעים…</>) : (<><Icon name="check" />קביעת השיעור{slot ? ` ב־${fmtTime(slot.starts_at)}` : ""}</>)}
        </button>
      </div>
    </div>
  );
}
