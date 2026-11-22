import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { Alert, Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { addSkill, deleteSkill, updateSkill } from "./actions";

export const metadata: Metadata = { title: "מיומנויות" };

type Skill = { id: string; name: string; category: string; sort: number; active: boolean };

export default async function SkillsPage({ searchParams }: PageProps<"/admin/skills">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("skills").select("id, name, category, sort, active").order("sort").order("name");
  const skills = (data ?? []) as Skill[];
  const categories = [...new Set(skills.map((s) => s.category))];
  const nextSort = (skills.at(-1)?.sort ?? 0) + 10;

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="ניהול" title="מיומנויות ומעקב התקדמות">
          <div className="facts">
            <span><Icon name="waves" small />{skills.filter((s) => s.active).length} מיומנויות פעילות</span>
            <span><Icon name="flag" small />{categories.length} קטגוריות</span>
          </div>
        </Head>
      }
    >
      {sp.err === "skill_in_use" ? (
        <Alert kind="bad">כבר נרשמה התקדמות למיומנות הזו, לכן אי אפשר למחוק אותה. אפשר לכבות אותה (לא פעילה) במקום.</Alert>
      ) : (
        <Flash sp={sp} />
      )}
      <Alert kind="info">
        המדריכים מסמנים לכל חניך אם מיומנות הושגה או בתרגול, מתוך יום העבודה. ההורים רואים את ההתקדמות בכרטיס הילד. הסדר כאן קובע את הסדר אצלם.
      </Alert>

      <div className="two">
        <div className="stack-s">
          {skills.length === 0 ? <div className="surf"><Empty icon="waves">אין מיומנויות עדיין.</Empty></div> : null}
          {categories.map((cat) => (
            <details key={cat} className="surf" open>
              <summary>
                {cat}
                <Pill kind="done">{skills.filter((s) => s.category === cat).length}</Pill>
              </summary>
              <div className="list">
                {skills
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <div key={s.id} className="pad stack-s">
                      <form action={updateSkill} className="inline-form">
                        <input type="hidden" name="id" value={s.id} />
                        <div className="field" style={{ flex: "2 1 180px" }}>
                          <label htmlFor={`n-${s.id}`}>שם</label>
                          <input className="inp" id={`n-${s.id}`} name="name" defaultValue={s.name} maxLength={80} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`c-${s.id}`}>קטגוריה</label>
                          <input className="inp" id={`c-${s.id}`} name="category" defaultValue={s.category} maxLength={40} required list="skill-cats" />
                        </div>
                        <div className="field" style={{ flex: "0 1 90px" }}>
                          <label htmlFor={`s-${s.id}`}>סדר</label>
                          <input className="inp num" id={`s-${s.id}`} name="sort" type="number" min={0} max={10000} defaultValue={s.sort} />
                        </div>
                        <label className="ck" style={{ paddingTop: 0, alignItems: "center" }}>
                          <input type="checkbox" name="active" defaultChecked={s.active} />
                          פעילה
                        </label>
                        <SubmitButton variant="quiet" sm>שמירה</SubmitButton>
                      </form>
                      <form action={deleteSkill}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton question={`למחוק את "${s.name}"?`} confirmLabel="מחיקה">מחיקה</ConfirmButton>
                      </form>
                    </div>
                  ))}
              </div>
            </details>
          ))}
        </div>

        <form action={addSkill} className="surf pad stack-s" aria-labelledby="add-skill">
          <b id="add-skill">מיומנות חדשה</b>
          <div className="field">
            <label htmlFor="name">שם המיומנות</label>
            <input className="inp" id="name" name="name" maxLength={80} required placeholder="למשל: צלילה לטבעת" />
          </div>
          <div className="field">
            <label htmlFor="category">קטגוריה</label>
            <input className="inp" id="category" name="category" maxLength={40} required list="skill-cats" defaultValue={categories[0] ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="sort">סדר הצגה</label>
            <input className="inp num" id="sort" name="sort" type="number" min={0} max={10000} defaultValue={nextSort} />
          </div>
          <SubmitButton variant="primary" sm><Icon name="plus" />הוספה</SubmitButton>
        </form>
      </div>
      <datalist id="skill-cats">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
    </Shell>
  );
}
