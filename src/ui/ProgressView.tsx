import { Pill, Vessel, Empty } from "./primitives";
import { categoryLevel, PROGRESS, type CategorySummary } from "@/domain/progress";
import { fmtDate } from "@/domain/format";
import "./progress.css";

/** Read-only progress: one waterline vessel per category + each skill's current status (word + icon). */
export function ProgressView({ summary, title = "התקדמות", compact }: { summary: CategorySummary[]; title?: string; compact?: boolean }) {
  const any = summary.some((c) => c.achieved || c.practicing);
  return (
    <section className="surf" aria-label={title}>
      {summary.length === 0 ? (
        <Empty icon="waves">עוד לא הוגדרו מיומנויות.</Empty>
      ) : !any && compact ? (
        <Empty icon="waves">עוד לא נרשמה התקדמות. המדריך מעדכן אחרי השיעורים.</Empty>
      ) : (
        summary.map((c) => {
          const level = categoryLevel(c);
          return (
            <div key={c.category} className="prog-cat">
              <div className="prog-head">
                <Vessel level={level} size="sm" label={`${c.category}: ${c.achieved} מתוך ${c.total} הושגו`} />
                <span className="col grow">
                  <b>{c.category}</b>
                  <small className="muted">
                    {c.achieved} מתוך {c.total} הושגו{c.practicing ? ` · ${c.practicing} בתרגול` : ""}
                  </small>
                </span>
              </div>
              {compact ? null : (
                <div className="stack-s">
                  {c.skills.map((s) => (
                    <div key={s.id} className="prog-skill">
                      <span className="col">
                        <span>{s.name}</span>
                        {s.note || s.at ? (
                          <small>
                            {s.note}
                            {s.note && s.at ? " · " : ""}
                            {s.at ? fmtDate(s.at) : ""}
                          </small>
                        ) : null}
                      </span>
                      <Pill kind={PROGRESS[s.status].kind}>{PROGRESS[s.status].label}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
