import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, homeFor } from "@/lib/auth";
import { fmtMoney } from "@/domain/format";
import { Wave } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";

export default async function Landing() {
  const me = await getProfile();
  if (me?.active) redirect(homeFor(me.role));

  const supabase = await createClient();
  const [{ data: settings }, { data: services }] = await Promise.all([
    supabase.from("settings").select("business_name, tagline, welcome_text, contact_phone, address").eq("id", 1).single(),
    supabase.from("services").select("id, name, description, duration_min, price_agorot, capacity").eq("active", true).order("sort"),
  ]);

  return (
    <div id="app">
      <header className="hero">
        <div className="in">
          <div className="topnav" style={{ padding: 0 }}>
            <span className="brand">SEA<em>.</em>D<em>.</em>CHANGE</span>
            <span className="grow" />
            <Link href="/login" className="btn sm ghost" style={{ background: "transparent", color: "#EAF3F8", boxShadow: "inset 0 0 0 1.5px rgba(169,216,235,.4)" }}>
              התחברות
            </Link>
          </div>
          <h1>לומדים מים. בבית.</h1>
          <p>{settings?.tagline}</p>
          <div className="ctas">
            <Link href="/signup" className="btn primary">
              <Icon name="plus" />
              הרשמה והזמנת שיעור
            </Link>
            <Link href="/login" className="btn quiet">כבר רשומים</Link>
          </div>
        </div>
        <Wave />
      </header>
      <main className="body" style={{ paddingTop: 24 }}>
        <section className="trio" aria-label="איך זה עובד">
          <div>
            <b className="num">1</b>
            <p>נרשמים עם מייל או Google ומוסיפים את הילדים — כמה שצריך.</p>
          </div>
          <div>
            <b className="num">2</b>
            <p>ממלאים הצהרת בריאות קצרה לכל ילד, פעם בשנה.</p>
          </div>
          <div>
            <b className="num">3</b>
            <p>בוחרים שיעור, מדריך ושעה פנויה. דודי מאשר ומקבלים עדכון.</p>
          </div>
        </section>

        <div className="sec-h"><h2>השיעורים שלנו</h2></div>
        <div className="cols3">
          {(services ?? []).map((s) => (
            <article key={s.id} className="surf pad stack-s">
              <h3 style={{ margin: 0, font: "800 18px var(--f-ui)" }}>{s.name}</h3>
              <p className="muted" style={{ margin: 0 }}>{s.description}</p>
              <div className="kv">
                <span><Icon name="clock" small />{s.duration_min} דקות</span>
                <span><Icon name="kids" small />{s.capacity === 1 ? "אישי" : `עד ${s.capacity} משתתפים`}</span>
              </div>
              <b className="big num" style={{ fontSize: 34 }}>{fmtMoney(s.price_agorot)}</b>
            </article>
          ))}
        </div>

        <section className="about">
          <div className="surf pad">
            <h3>מי אנחנו</h3>
            <p>{settings?.welcome_text}</p>
          </div>
          <div className="surf pad stack-s">
            <h3>יצירת קשר</h3>
            {settings?.contact_phone ? (
              <p className="row" style={{ margin: 0 }}><Icon name="send" small /><span dir="ltr">{settings.contact_phone}</span></p>
            ) : null}
            {settings?.address ? (
              <p className="row" style={{ margin: 0 }}><Icon name="pin" small />{settings.address}</p>
            ) : null}
            <Link href="/signup" className="btn solid" style={{ justifySelf: "start", marginTop: 6 }}>להרשמה</Link>
          </div>
        </section>
        <p className="center muted small">© {settings?.business_name}</p>
      </main>
    </div>
  );
}
