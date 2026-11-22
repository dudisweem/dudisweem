"use client";
import Link from "next/link";
import { PayNow } from "./PayNow";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/ui/AppShell";
import { Icon, type IconName } from "@/ui/Icon";
import { Pill, Vessel, Alert } from "@/ui/primitives";
import { dayNum, fmtDate, fmtDayLabel, fmtMoney, fmtShortDay, fmtTime, localToUtc } from "@/domain/format";
import { errorText, PAYMENT_LABEL, type Payment, type Role } from "@/domain/labels";
import {
  checkAttempt,
  checkSeries,
  fetchSlots,
  joinWaitlist,
  submitBooking,
  submitSeries,
  type BookResult,
  type SeriesResult,
  type Slot,
} from "@/app/(parent)/book/actions";

// series / waitlist codes not covered by the shared error table
const LOCAL_ERR: Record<string, string> = {
  beyond_horizon: "מעבר לחלון ההזמנה",
  bad_weeks: "מספר שבועות לא תקין",
  bad_day: "היום מחוץ לחלון ההזמנה",
  time_order: "שעת הסיום חייבת להיות אחרי שעת ההתחלה",
};
const errOf = (code?: string | null) => (code && LOCAL_ERR[code]) || errorText(code);
const WEEK_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];

export type FlowKid = {
  id: string;
  name: string;
  first: string;
  color: string;
  sub: string;
  age: number | null;
  healthOk: boolean;
  creditsByService: Record<string, { left: number; total: number }>;
};
export type FlowService = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  capacity: number;
  minAge: number | null;
  maxAge: number | null;
};

const STEPS = ["ילד", "שיעור", "מועד", "תשלום", "סיכום"];
const TITLES = ["למי השיעור?", "איזה שיעור?", "מתי נוח לכם?", "איך משלמים?", "בדיקה ושליחה"];
const PAY_ICON: Record<Payment, IconName> = { card: "card", bit: "wallet", paybox: "wallet", cash: "cash" };

type Status = "idle" | "saving" | "checking" | "sent" | "error";

export function BookingFlow(props: {
  role: Role;
  name: string;
  kids: FlowKid[];
  services: FlowService[];
  instructors: { id: string; name: string }[];
  days: string[];
  payments: Payment[];
  cancellationHours: number;
  requireApproval: boolean;
  bitPhone: string;
  payboxLink: string;
  bitLink: string;
  initialKid: string | null;
  initialService?: string | null;
  initialDay?: string | null;
  horizonDays: number;
}) {
  const { kids, services, instructors, days, payments } = props;
  // deep link from a waitlist offer: /book?kid=&service=&day= jumps straight to the slots
  const preService = props.initialService && services.some((s) => s.id === props.initialService) ? props.initialService : null;
  const preDay = props.initialDay && days.includes(props.initialDay) ? props.initialDay : null;
  const [step, setStep] = useState(props.initialKid ? (preService && preDay ? 2 : 1) : 0);
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const [kidId, setKidId] = useState<string | null>(props.initialKid);
  const [serviceId, setServiceId] = useState<string | null>(props.initialKid ? preService : null);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(props.initialKid && preService ? preDay : null);
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [series, setSeries] = useState<SeriesResult | null>(null);
  const [wl, setWl] = useState<{ state: "idle" | "saving" | "done" | "error"; code?: string }>({ state: "idle" });
  const [wlFrom, setWlFrom] = useState("");
  const [wlTo, setWlTo] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotState, setSlotState] = useState<{ key: string; slots: Slot[]; error: boolean }>({ key: "", slots: [], error: false });
  const [payment, setPayment] = useState<Payment | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<BookResult | null>(null);
  const [errCode, setErrCode] = useState<string | null>(null);
  // one attempt id per booking flow; retries reuse it so the server dedupes
  const attemptRef = useRef<string>("");
  const latestRef = useRef<string>("");

  useEffect(() => {
    attemptRef.current = crypto.randomUUID();
  }, []);

  const kid = kids.find((k) => k.id === kidId) ?? null;
  const service = services.find((s) => s.id === serviceId) ?? null;
  const credit = kid && service ? kid.creditsByService[service.id] ?? { left: 0, total: 0 } : { left: 0, total: 0 };

  const slotKey = (svc: string | null, ins: string | null, d: string | null) => (svc && d ? `${svc}|${ins ?? "any"}|${d}` : "");
  const currentKey = slotKey(serviceId, instructorId, day);
  const slotsLoading = currentKey !== "" && slotState.key !== currentKey;
  const slots = slotState.key === currentKey ? slotState.slots : null;
  const slotsError = slotState.key === currentKey && slotState.error;

  // Fetch slots for a selection. Only the latest request may write; older responses are dropped (out-of-order safe).
  function loadSlots(svc: string | null, ins: string | null, d: string | null) {
    const key = slotKey(svc, ins, d);
    latestRef.current = key;
    if (!key) return;
    setSlotState((s) => (s.key === key ? { key: "", slots: [], error: false } : s));
    fetchSlots(svc!, d!, ins)
      .then((r) => {
        if (latestRef.current !== key) return;
        setSlotState("error" in r ? { key, slots: [], error: true } : { key, slots: r.slots, error: false });
      })
      .catch(() => {
        if (latestRef.current === key) setSlotState({ key, slots: [], error: true });
      });
  }

  // waitlist deep link: fetch the preselected day's slots once on mount
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current || !serviceId || !day) return;
    preloaded.current = true;
    loadSlots(serviceId, instructorId, day);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot preload for the deep link
  }, []);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickKid = (id: string) => {
    setKidId(id);
    setSlot(null);
    if (payment === "card") setPayment(null);
  };
  const pickService = (id: string) => {
    setServiceId(id);
    setSlot(null);
    loadSlots(id, instructorId, day);
    if (payment === "card") setPayment(null);
  };
  const pickInstructor = (id: string | null) => {
    setInstructorId(id);
    setSlot(null);
    setWl({ state: "idle" });
    loadSlots(serviceId, id, day);
  };
  const pickDay = (d: string) => {
    setDay(d);
    setSlot(null);
    setWl({ state: "idle" });
    loadSlots(serviceId, instructorId, d);
  };

  const canNext = [!!kid, !!service, !!slot, !!payment, true][step];

  async function send() {
    if (!kid || !service || !slot || !payment) return;
    setStatus("saving");
    setErrCode(null);
    const input = {
      attemptId: attemptRef.current,
      studentId: kid.id,
      serviceId: service.id,
      instructorId: slot.instructorId,
      startsAt: slot.startsAt,
      payment,
      note: note.trim().slice(0, 500),
    };
    if (repeat) {
      // same attempt id on every retry → the server returns the same series, never a second one
      let s: SeriesResult = { ok: "unknown" };
      for (let i = 0; i < 3; i++) {
        try {
          s = await submitSeries({ ...input, weeks });
        } catch {
          s = { ok: "unknown" };
        }
        if (s.ok !== "unknown") break;
        setStatus("checking");
        await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
      }
      applySeries(s);
      return;
    }
    let r: BookResult = { ok: "unknown" };
    for (let i = 0; i < 3; i++) {
      try {
        r = await submitBooking(input);
      } catch {
        r = { ok: "unknown" };
      }
      if (r.ok !== "unknown") break;
      setStatus("checking");
      await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    }
    applyResult(r);
  }

  function applyResult(r: BookResult) {
    setResult(r);
    if (r.ok === true) setStatus("sent");
    else if (r.ok === "unknown") setStatus("checking");
    else {
      setStatus("error");
      setErrCode(r.code);
      if (r.code === "slot_taken") {
        setSlot(null);
        loadSlots(serviceId, instructorId, day);
      }
    }
  }

  function applySeries(s: SeriesResult) {
    setSeries(s);
    if (s.ok === true) {
      const first = s.weeks.find((w) => w.ok);
      setResult({ ok: true, bookingId: "", number: first?.number ?? 0, status: first?.status ?? "pending" });
      setStatus("sent");
    } else if (s.ok === "unknown") setStatus("checking");
    else {
      setStatus("error");
      setErrCode(s.code);
    }
  }

  async function recheck() {
    setStatus("checking");
    try {
      if (repeat) applySeries(await checkSeries(attemptRef.current));
      else applyResult(await checkAttempt(attemptRef.current));
    } catch {
      setStatus("checking");
    }
  }

  async function addToWaitlist() {
    if (!kid || !service || !day) return;
    setWl({ state: "saving" });
    try {
      const r = await joinWaitlist({ studentId: kid.id, serviceId: service.id, instructorId, day, from: wlFrom || null, to: wlTo || null });
      setWl(r.ok ? { state: "done" } : { state: "error", code: r.code });
    } catch {
      setWl({ state: "error", code: "unknown" });
    }
  }

  function again() {
    attemptRef.current = crypto.randomUUID();
    latestRef.current = "";
    setSlotState({ key: "", slots: [], error: false });
    setStep(0);
    setDir(0);
    setKidId(null);
    setServiceId(null);
    setInstructorId(null);
    setDay(null);
    setSlot(null);
    setPayment(null);
    setNote("");
    setStatus("idle");
    setResult(null);
    setErrCode(null);
    setRepeat(false);
    setSeries(null);
    setWl({ state: "idle" });
  }

  // ------------------------------------------------------------- sent
  if (status === "sent" && result?.ok === true && kid && service && slot && payment) {
    const approved = result.status === "approved";
    return (
      <AppShell role={props.role} name={props.name} head={<><span className="k">הזמנת שיעור</span><h1>{approved ? "השיעור נקבע" : "הבקשה נשלחה"}</h1></>}>
        <div className="surf success" role="status">
          <div className="drop">
            <div className="lvl">
              <svg viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0Z" /></svg>
            </div>
            <Icon name="check" />
          </div>
          <h2 style={{ margin: "6px 0 0", font: "800 22px var(--f-ui)" }}>המקום נשמר ל{kid.first}</h2>
          <p style={{ margin: 0, color: "var(--mut)", maxWidth: "36ch" }}>
            יום {fmtShortDay(slot.startsAt)} {fmtDayLabel(day!)} בשעה {fmtTime(slot.startsAt)} עם {slot.instructorName}.{" "}
            {approved ? "השיעור מאושר." : "הבקשה ממתינה לאישור המנהל."}
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {approved ? <Pill kind="ok">מאושר</Pill> : <Pill kind="wait">ממתין לאישור</Pill>}
            <span className="pill p-done num">בקשה #{result.number}</span>
          </div>
        </div>
        {series?.ok === true ? (
          <div className="surf pad stack-s">
            <b>נקבעו {series.booked} מתוך {series.weeks.length} שבועות</b>
            <div className="series-list">
              {series.weeks.map((w) => (
                <div key={w.index} className="row">
                  <span className="num">שבוע {w.index + 1} · {fmtShortDay(w.start)} {fmtDate(w.start)} {fmtTime(w.start)}</span>
                  {w.ok ? (
                    w.status === "approved" ? <Pill kind="ok">נקבע</Pill> : <Pill kind="wait">ממתין לאישור</Pill>
                  ) : (
                    <Pill kind="bad">דולג · {errOf(w.code)}</Pill>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {payment === "bit" || payment === "paybox" ? (
          <div className="surf pad row" style={{ alignItems: "flex-start" }}>
            <span className="av m" style={{ background: "var(--free-bg)", color: "var(--free)" }}><Icon name="wallet" /></span>
            <span className="col grow">
              <b>תשלום ב־{PAYMENT_LABEL[payment]} · {fmtMoney(service.price)}</b>
              <PayNow method={payment} amount={service.price} bitPhone={props.bitPhone} bitLink={props.bitLink} payboxLink={props.payboxLink} />
              <small>ההעברה לא מסומנת ״שולם״ אוטומטית — המנהל מאמת את קבלת הכסף.</small>
            </span>
          </div>
        ) : null}
        {payment === "card" ? (
          <div className="surf pad row">
            <Vessel level={credit.total ? Math.round(((credit.left - 1) / credit.total) * 100) : 0} size="sm" reserved={credit.total ? 100 / credit.total : 0} label={`שיעור אחד שמור מהכרטיסייה`} />
            <span className="col grow">
              <b>שיעור אחד שמור מהכרטיסייה</b>
              <small>יתרה זמינה להזמנה: {Math.max(credit.left - 1, 0)}. ביטול בזמן מחזיר את השיעור.</small>
            </span>
          </div>
        ) : null}
        {payment === "cash" ? (
          <div className="surf pad row">
            <span className="av m" style={{ background: "var(--mist)", color: "var(--navy)" }}><Icon name="cash" /></span>
            <span className="col grow"><b>תשלום במזומן · {fmtMoney(service.price)}</b><small>משלמים בבריכה ביום השיעור.</small></span>
          </div>
        ) : null}
        <div className="grid2">
          <Link className="btn solid" href="/home">לבית</Link>
          <button className="btn ghost" type="button" onClick={again}>הזמנה נוספת</button>
        </div>
      </AppShell>
    );
  }

  const pct = Math.round(((step + 1) / 5) * 100);
  const head = (
    <>
      <span className="k">הזמנת שיעור · שלב {step + 1} מתוך 5</span>
      <h1>{TITLES[step]}</h1>
      <div className="steps">
        <div className="vessel wide" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={5} aria-label="התקדמות ההזמנה">
          <div className="lvl" style={{ width: `${pct}%` }} />
        </div>
        <div className="lbls">
          {STEPS.map((n, i) => (i === step ? <b key={n}>{n}</b> : <span key={n}>{n}</span>))}
        </div>
      </div>
    </>
  );

  let body: React.ReactNode = null;
  if (step === 0) {
    body = (
      <>
        {kids.map((k) => (
          <button key={k.id} type="button" className="choice" aria-pressed={kidId === k.id} disabled={!k.healthOk} onClick={() => pickKid(k.id)}>
            <span className="mark"><Icon name="check" /></span>
            <span className="av l" style={{ background: k.color }} aria-hidden="true">{k.first.charAt(0)}</span>
            <span className="col grow">
              <b>{k.name}</b>
              {k.sub ? <small>{k.sub}</small> : null}
              {!k.healthOk ? <small style={{ color: "var(--wait)", fontWeight: 700 }}>אפשר להזמין אחרי מילוי הצהרת בריאות</small> : null}
            </span>
            {k.healthOk ? <Pill kind="ok">בריאות בתוקף</Pill> : null}
          </button>
        ))}
        {kids.filter((k) => !k.healthOk).map((k) => (
          <Link key={k.id} className="btn quiet sm" href={`/kids/${k.id}/health`} style={{ justifySelf: "start" }}>
            <Icon name="heart" />
            למילוי הצהרת בריאות ל{k.first}
          </Link>
        ))}
      </>
    );
  } else if (step === 1) {
    body =
      services.length === 0 ? (
        <div className="surf empty"><Icon name="waves" /><div>אין כרגע שיעורים פתוחים להזמנה.</div></div>
      ) : (
        services.map((s) => {
          const ageBlock =
            kid?.age != null && ((s.minAge != null && kid.age < s.minAge) || (s.maxAge != null && kid.age > s.maxAge));
          return (
            <button key={s.id} type="button" className="choice" aria-pressed={serviceId === s.id} disabled={!!ageBlock} onClick={() => pickService(s.id)}>
              <span className="mark"><Icon name="check" /></span>
              <span className="col grow">
                <b>{s.name}</b>
                <small>{[s.description, `${s.duration} דק׳`, s.capacity > 1 ? `עד ${s.capacity} משתתפים` : null].filter(Boolean).join(" · ")}</small>
                {ageBlock ? <small style={{ color: "var(--wait)", fontWeight: 700 }}>מתאים לגילאי {s.minAge ?? 0}–{s.maxAge ?? "∞"}</small> : null}
              </span>
              <span className="big num" style={{ fontSize: 34 }}>
                {fmtMoney(s.price).replace(" ₪", "")}
                <em>₪ לשיעור</em>
              </span>
            </button>
          );
        })
      );
  } else if (step === 2) {
    body = (
      <>
        {instructors.length > 1 ? (
          <div className="field">
            <span className="lab" id="ins-lab">מדריך</span>
            <div className="chips" role="group" aria-labelledby="ins-lab">
              <button type="button" className="chip" aria-pressed={instructorId === null} onClick={() => pickInstructor(null)}>כל מדריך פנוי</button>
              {instructors.map((i) => (
                <button key={i.id} type="button" className="chip" aria-pressed={instructorId === i.id} onClick={() => pickInstructor(i.id)}>{i.name}</button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="field">
          <span className="lab" id="day-lab">יום</span>
          <div className="days" role="group" aria-labelledby="day-lab">
            {days.map((d) => {
              const at = localToUtc(d, "12:00");
              return (
                <button key={d} type="button" className="day num" aria-pressed={day === d} onClick={() => pickDay(d)} aria-label={`יום ${fmtShortDay(at)} ${fmtDayLabel(d)}`}>
                  {fmtShortDay(at)}
                  <b>{dayNum(d)}</b>
                </button>
              );
            })}
          </div>
        </div>
        {day ? (
          <div className="field" aria-live="polite" aria-busy={slotsLoading}>
            <span className="lab">שעות פנויות · {fmtDayLabel(day)}</span>
            {slotsLoading ? (
              <div className="surf pad hint row"><span className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 600ms linear infinite" }} aria-hidden="true" />מחפשים זמנים פנויים…</div>
            ) : slotsError ? (
              <Alert kind="bad">לא הצלחנו לטעון זמנים. בחרו שוב את היום.</Alert>
            ) : slots && slots.length ? (
              <div className="slots">
                {slots.map((s) => {
                  const sel = slot?.startsAt === s.startsAt && slot.instructorId === s.instructorId;
                  return (
                    <button key={`${s.startsAt}|${s.instructorId}`} type="button" className="slot num" aria-pressed={sel} onClick={() => setSlot(s)}>
                      <b>{fmtTime(s.startsAt)}</b>
                      {s.instructorName}
                      {service && service.capacity > 1 ? ` · ${s.spotsLeft} מקומות` : ` · ${service?.duration} דק׳`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="surf pad stack-s">
                <span className="hint">אין זמנים פנויים ביום הזה{instructorId ? " אצל המדריך שבחרתם" : ""}. נסו יום אחר{instructorId ? " או ״כל מדריך פנוי״" : ""} — או הצטרפו לרשימת ההמתנה.</span>
                {wl.state === "done" ? (
                  <Alert kind="ok">נרשמתם לרשימת ההמתנה ל־{fmtDayLabel(day)}. אם יתפנה מקום תקבלו התראה (ובמייל) — מי שמזמין ראשון מקבל.</Alert>
                ) : kid && service ? (
                  <>
                    <div className="cols2">
                      <div className="field">
                        <label htmlFor="wl-from">משעה (לא חובה)</label>
                        <input className="inp ltr" id="wl-from" type="time" step={900} value={wlFrom} onChange={(e) => setWlFrom(e.target.value)} dir="ltr" />
                      </div>
                      <div className="field">
                        <label htmlFor="wl-to">עד שעה (לא חובה)</label>
                        <input className="inp ltr" id="wl-to" type="time" step={900} value={wlTo} onChange={(e) => setWlTo(e.target.value)} dir="ltr" />
                      </div>
                    </div>
                    {wl.state === "error" ? <Alert kind="bad">{errOf(wl.code)}</Alert> : null}
                    <button type="button" className="btn ghost" onClick={addToWaitlist} disabled={wl.state === "saving"} aria-busy={wl.state === "saving" || undefined}>
                      {wl.state === "saving" ? <><span className="spin" aria-hidden="true" />נרשמים…</> : <><Icon name="flag" />רשימת המתנה ל{kid.first}</>}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>בחרו יום כדי לראות שעות פנויות.</p>
        )}
      </>
    );
  } else if (step === 3) {
    body = (
      <>
        {payments.map((p) => {
          const noCredit = p === "card" && credit.left <= 0;
          const desc =
            p === "card"
              ? noCredit
                ? "אין יתרה בכרטיסייה לשיעור הזה. אפשר לרכוש כרטיסייה דרך בית הספר."
                : `נותרו ${credit.left} שיעורים. שיעור אחד נשמר לבקשה; ביטול בזמן מחזיר אותו.`
              : p === "cash"
                ? `${fmtMoney(service!.price)} במזומן בבריכה ביום השיעור.`
                : `${fmtMoney(service!.price)}. פרטי ההעברה יופיעו אחרי שליחת הבקשה. המנהל מאמת את קבלת הכסף.`;
          return (
            <button key={p} type="button" className="choice" aria-pressed={payment === p} disabled={noCredit} onClick={() => setPayment(p)} style={{ alignItems: "flex-start" }}>
              <span className="mark" style={{ marginTop: 2 }}><Icon name="check" /></span>
              {p === "card" && credit.total > 0 ? (
                <Vessel level={Math.round((credit.left / credit.total) * 100)} size="sm" label={`${credit.left} מתוך ${credit.total}`} reserved={payment === "card" ? 100 / credit.total : 0} />
              ) : (
                <span className="av m" style={{ background: "var(--mist)", color: "var(--navy)" }}><Icon name={PAY_ICON[p]} /></span>
              )}
              <span className="col grow">
                <b>{p === "cash" ? "מזומן ביום השיעור" : PAYMENT_LABEL[p]}</b>
                <small>{desc}</small>
              </span>
            </button>
          );
        })}
        <div className="field">
          <label htmlFor="note">הערה למדריך</label>
          <textarea className="inp" id="note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" />
        </div>
        <div className="surf pad stack-s">
          <label className="toggle" style={{ borderTop: 0, padding: 0 }}>
            <span className="col">
              <b>חוזר כל שבוע</b>
              <small>אותו יום ושעה{slot ? ` (${fmtShortDay(slot.startsAt)} ${fmtTime(slot.startsAt)})` : ""} למשך כמה שבועות</small>
            </span>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          </label>
          {repeat ? (
            <div className="field">
              <label htmlFor="weeks">מספר שבועות</label>
              <select className="inp" id="weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {WEEK_OPTIONS.map((w) => (
                  <option key={w} value={w}>{w} שבועות</option>
                ))}
              </select>
              <span className="hint">
                כל שבוע נבדק בנפרד (מקום פנוי, כרטיסייה, אישור). שבוע תפוס או מעבר ל־{props.horizonDays} ימים מהיום יידלג, והשאר ייקבעו.
              </span>
            </div>
          ) : null}
        </div>
      </>
    );
  } else if (step === 4 && kid && service && slot && payment) {
    body = (
      <>
        <div className="surf pad">
          <div className="sum">
            <div><span>תלמיד</span><b>{kid.name}</b></div>
            <div><span>שיעור</span><b>{service.name} · {service.duration} דק׳</b></div>
            <div><span>מועד</span><b className="num">יום {fmtShortDay(slot.startsAt)} {fmtDayLabel(day!)} · {fmtTime(slot.startsAt)}</b></div>
            <div><span>מדריך</span><b>{slot.instructorName}</b></div>
            <div><span>תשלום</span><b>{PAYMENT_LABEL[payment]}{payment === "card" ? "" : ` · ${fmtMoney(service.price)}`}</b></div>
            {repeat ? <div><span>חזרה</span><b>כל שבוע · {weeks} שבועות</b></div> : null}
            <div><span>בריאות</span><b><Pill kind="ok">בתוקף</Pill></b></div>
            {note.trim() ? <div><span>הערה</span><b style={{ whiteSpace: "pre-line" }}>{note.trim()}</b></div> : null}
          </div>
        </div>
        <div className="surf pad row" style={{ alignItems: "flex-start" }}>
          <Icon name="clock" />
          <span className="col">
            <b style={{ fontSize: 14.5 }}>מדיניות ביטול</b>
            <small>ביטול או שינוי עד {props.cancellationHours} שעות לפני תחילת השיעור. בפחות מזה השיעור מחויב.</small>
          </span>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {props.requireApproval ? "המועד נשמר לכם מרגע השליחה וממתין לאישור המנהל." : "השיעור נקבע מיד עם השליחה."}
          {payment === "bit" || payment === "paybox" ? ` אחרי השליחה יופיע כפתור לתשלום ב־${PAYMENT_LABEL[payment]}.` : ""}
        </p>
        {status === "error" && errCode ? (
          <Alert kind="bad">
            {errOf(errCode)}
            {errCode === "not_authenticated" ? (
              <> <Link className="link" href="/login?next=/book">התחברות</Link></>
            ) : null}
            {errCode === "slot_taken" || errCode === "overlap_student" ? (
              <> <button type="button" className="link" onClick={() => go(2)}>בחירת מועד אחר</button></>
            ) : null}
          </Alert>
        ) : null}
        {status === "checking" ? (
          <Alert kind="wait">
            בודקים אם הפעולה נשמרה… אין צורך לשלוח שוב.{" "}
            <button type="button" className="link" onClick={recheck}>בדיקה שוב</button>
          </Alert>
        ) : null}
      </>
    );
  }

  const isSend = step === 4;
  const busy = status === "saving" || status === "checking";
  return (
    <AppShell role={props.role} name={props.name} head={head}>
      <div key={step} className={`stepbody${dir < 0 ? " back" : ""}${dir === 0 ? " still" : ""}`} style={{ display: "grid", gap: 12 }}>
        {body}
      </div>
      <div className="stepper-foot">
        {step > 0 ? (
          <button className="btn ghost" type="button" onClick={() => go(step - 1)} disabled={busy}>
            <Icon name="right" />
            חזרה
          </button>
        ) : null}
        <button
          className={`btn ${isSend ? "primary" : "solid"}`}
          type="button"
          disabled={!canNext || busy}
          aria-busy={busy || undefined}
          onClick={() => (isSend ? send() : go(step + 1))}
        >
          {busy ? (
            <>
              <span className="spin" aria-hidden="true" />
              {status === "checking" ? "בודקים…" : "שולחים…"}
            </>
          ) : isSend ? (
            <>
              <Icon name="send" />
              שליחת בקשה
            </>
          ) : (
            <>
              המשך
              <Icon name="left" />
            </>
          )}
        </button>
      </div>
    </AppShell>
  );
}
