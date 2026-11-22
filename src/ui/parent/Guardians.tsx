"use client";
import { useActionState } from "react";
import { inviteGuardian, removeGuardian, respondInvitation, type FormState } from "@/app/(parent)/actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { ConfirmAction } from "./ConfirmAction";

type Guardian = { id: string; invited_email: string; full_name: string; accepted: boolean; is_me: boolean };

/** "Additional parents" on the kid page: owner invites/removes; a guardian can leave. */
export function Guardians({ studentId, kidName, guardians, isOwner }: { studentId: string; kidName: string; guardians: Guardian[]; isOwner: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(inviteGuardian, null);
  return (
    <section className="surf pad stack" aria-labelledby="guardians-h">
      <div className="row">
        <span className="av m" style={{ background: "var(--mist)", color: "var(--navy)" }}><Icon name="kids" /></span>
        <span className="col grow">
          <h2 id="guardians-h" style={{ margin: 0, font: "800 16px var(--f-ui)" }}>הורים נוספים</h2>
          <small>הורה נוסף יכול לראות את {kidName}, להזמין ולבטל שיעורים ולמלא הצהרת בריאות.</small>
        </span>
      </div>

      {guardians.length ? (
        <div className="list" style={{ marginInline: -16 }}>
          {guardians.map((g) => (
            <div key={g.id} className="li">
              <span className="col grow">
                <b>{g.full_name || g.invited_email}</b>
                <small dir="ltr" style={{ textAlign: "right" }}>{g.invited_email}</small>
              </span>
              {g.accepted ? <Pill kind="ok">פעיל</Pill> : <Pill kind="wait">ממתין לאישור</Pill>}
              {isOwner || g.is_me ? (
                <ConfirmAction
                  action={removeGuardian}
                  fields={{ id: g.id, student_id: studentId, ...(g.is_me ? { self: "1" } : {}) }}
                  label={g.is_me ? "יציאה" : "הסרה"}
                  question={g.is_me ? `להפסיק לנהל את ${kidName}?` : `להסיר את ${g.full_name || g.invited_email}?`}
                  confirmLabel={g.is_me ? "כן, לצאת" : "כן, להסיר"}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>עדיין לא הוזמנו הורים נוספים.</p>
      )}

      {isOwner ? (
        <form action={action} className="stack-s" noValidate>
          <input type="hidden" name="student_id" value={studentId} />
          <div className="field">
            <label htmlFor="guardian-email">מייל של ההורה הנוסף</label>
            <input className="inp ltr" id="guardian-email" name="email" type="email" inputMode="email" autoComplete="off" dir="ltr" required placeholder="name@example.com" />
            <span className="hint">ההורה יתחבר עם המייל הזה (או עם Google) ויאשר את ההזמנה בדף הבית.</span>
          </div>
          {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
          {state?.ok ? <Alert kind="ok">{state.ok}</Alert> : null}
          <SubmitButton variant="solid" pendingLabel="שומרים…">
            <Icon name="send" small />
            הזמנת הורה נוסף
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}

type Invitation = { id: string; student_first_name: string; inviter_name: string };

function InvitationRow({ inv }: { inv: Invitation }) {
  const [state, action] = useActionState<FormState, FormData>(respondInvitation, null);
  if (state?.ok) return <Alert kind="ok">{state.ok}</Alert>;
  return (
    <div className="surf pad stack-s lit">
      <div className="row">
        <span className="av m" style={{ background: "var(--free-bg)", color: "var(--free)" }}><Icon name="kids" /></span>
        <span className="col grow">
          <b>{inv.inviter_name} מזמין/ה אתכם לנהל את {inv.student_first_name}</b>
          <small>אחרי האישור תוכלו לראות שיעורים, להזמין ולבטל, ולמלא הצהרת בריאות.</small>
        </span>
      </div>
      {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
      <form action={action} className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <input type="hidden" name="id" value={inv.id} />
        <SubmitButton name="accept" value="1" sm pendingLabel="מאשרים…">
          <Icon name="check" small />
          אישור
        </SubmitButton>
        <SubmitButton name="accept" value="0" variant="ghost" sm pendingLabel="דוחים…">
          דחייה
        </SubmitButton>
      </form>
    </div>
  );
}

export function Invitations({ invitations }: { invitations: Invitation[] }) {
  if (!invitations.length) return null;
  return (
    <div className="stack-s">
      {invitations.map((i) => (
        <InvitationRow key={i.id} inv={i} />
      ))}
    </div>
  );
}
