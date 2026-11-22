"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadPool, type PoolRow } from "@/app/pool/actions";
import { Icon } from "./Icon";
import { fmtTime, fmtWeekday, fmtDate } from "@/domain/format";

type Session = {
  key: string;
  start: number;
  end: number;
  service: string;
  instructor: string;
  instructorColor: string;
  kids: { label: string; color: string; status: string }[];
};

/** One session = same instructor + start + service (a group has several kids). */
function group(rows: PoolRow[]): Session[] {
  const map = new Map<string, Session>();
  for (const r of rows) {
    const key = `${r.instructor_id}|${r.starts_at}|${r.service_name}`;
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        start: new Date(r.starts_at).getTime(),
        end: new Date(r.ends_at).getTime(),
        service: r.service_name,
        instructor: r.instructor_name || "מדריך",
        instructorColor: r.instructor_color,
        kids: [],
      };
      map.set(key, s);
    }
    s.kids.push({ label: r.kid_label, color: r.kid_color, status: r.status });
  }
  return [...map.values()].sort((a, b) => a.start - b.start || a.instructor.localeCompare(b.instructor, "he"));
}

function Kids({ s }: { s: Session }) {
  return (
    <div className="kids">
      {s.kids.map((k, i) => (
        <span className="k" key={i}>
          <span className="av m" style={{ background: k.color }} aria-hidden="true">{k.label.charAt(0)}</span>
          {k.label}
          {k.status === "no_show" ? <small style={{ color: "#F5B7AE", fontWeight: 700 }}>· לא הגיע</small> : null}
        </span>
      ))}
    </div>
  );
}

function Range({ s, big }: { s: Session; big?: boolean }) {
  return (
    <span className="tt num" style={big ? undefined : { fontSize: 54 }}>
      {fmtTime(new Date(s.start))}–{fmtTime(new Date(s.end))}
    </span>
  );
}

export function PoolBoard({ initial, backHref }: { initial: { rows: PoolRow[]; at: string } | null; backHref: string }) {
  const [rows, setRows] = useState<PoolRow[]>(initial?.rows ?? []);
  const [updated, setUpdated] = useState<string | null>(initial?.at ?? null);
  const [failed, setFailed] = useState(!initial);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await loadPool();
      if ("error" in r) setFailed(true);
      else {
        setRows(r.rows);
        setUpdated(r.at);
        setFailed(false);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(refresh, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh]);

  const sessions = group(rows);
  const current = sessions.filter((s) => s.start <= now && now < s.end);
  const past = sessions.filter((s) => s.end <= now);
  const lastEnd = past.length ? Math.max(...past.map((s) => s.end)) : null;
  const previous = lastEnd ? past.filter((s) => s.end === lastEnd) : [];
  const upcoming = sessions.filter((s) => s.start > now);
  const nextStarts = [...new Set(upcoming.map((s) => s.start))].slice(0, 2);
  const next = upcoming.filter((s) => nextStarts.includes(s.start));

  const nowDate = new Date(now);
  return (
    <div className="pool" id="app">
      <div className="ph">
        <div>
          <span className="brand" style={{ color: "#A9D8EB" }}>SWEEMER</span>
          <div style={{ font: "800 22px var(--f-ui)", marginTop: 8 }}>תצוגת בריכה</div>
        </div>
        <div className="clock num" aria-live="off">
          {fmtTime(nowDate)}
          <small>
            יום {fmtWeekday(nowDate)} · {fmtDate(nowDate)}
          </small>
        </div>
        <div className="upd">
          <span role="status">
            {failed ? "אין חיבור — מציג את הנתונים האחרונים" : updated ? `עודכן ${fmtTime(new Date(updated))}` : ""}
          </span>
          <button type="button" onClick={refresh}>
            <Icon name="refresh" small />
            רענון
          </button>
          <Link href={backHref} style={{ color: "#A9D8EB", fontWeight: 700, textDecoration: "none", minHeight: 40, display: "flex", alignItems: "center" }}>
            יציאה
          </Link>
        </div>
      </div>

      <div className="pcols">
        <section className="pc dim" aria-label="השיעור הקודם">
          <h2>השיעור הקודם</h2>
          {previous.length ? (
            previous.map((s) => (
              <div className="sess" key={s.key}>
                <Range s={s} />
                <span className="lbl">{s.service} · {s.instructor}</span>
                <Kids s={s} />
              </div>
            ))
          ) : (
            <span className="lbl">עוד לא היו שיעורים היום</span>
          )}
        </section>

        <section className="pc now" aria-label="עכשיו במים">
          <h2>עכשיו במים</h2>
          {current.length ? (
            current.map((s, i) => {
              const total = (s.end - s.start) / 60000;
              const elapsed = Math.max(0, (now - s.start) / 60000);
              const left = Math.max(0, Math.ceil(total - elapsed));
              return (
                <div className="sess" key={s.key}>
                  <Range s={s} big={i === 0} />
                  <span className="lbl">
                    <span className="dot-c" style={{ background: s.instructorColor, marginInlineEnd: 8 }} aria-hidden="true" />
                    {s.service} · {s.instructor}
                  </span>
                  <Kids s={s} />
                  <div className="elapsed" role="img" aria-label={`עברו ${Math.round(elapsed)} דקות מתוך ${total}`}>
                    <i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
                  </div>
                  <span className="lbl num" style={{ fontSize: 14, color: "#A9D8EB" }}>נותרו {left} דקות</span>
                </div>
              );
            })
          ) : (
            <div className="sess">
              <span className="tt num" style={{ fontSize: 54 }}>—</span>
              <span className="lbl">{next.length ? `הבריכה פנויה. השיעור הבא ב־${fmtTime(new Date(next[0]!.start))}` : "אין שיעור כרגע"}</span>
            </div>
          )}
          <div className="wavebg" />
        </section>

        <section className="pc" aria-label="השיעורים הבאים">
          <h2>הבא בתור</h2>
          {next.length ? (
            next.map((s) => (
              <div className="sess" key={s.key}>
                <Range s={s} />
                <span className="lbl">{s.service} · {s.instructor}</span>
                <Kids s={s} />
              </div>
            ))
          ) : (
            <span className="lbl">אין עוד שיעורים היום</span>
          )}
        </section>
      </div>
    </div>
  );
}
