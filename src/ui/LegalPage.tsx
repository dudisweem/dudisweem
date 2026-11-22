import Link from "next/link";
import type { ReactNode } from "react";
import { Wave } from "./primitives";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div id="app">
      <header className="band">
        <div className="topnav">
          <Link href="/" className="brand" aria-label="SWEEMER דף הבית">SWEEMER</Link>
        </div>
        <div className="bhead">
          <span className="k">עודכן לאחרונה: {updated}</span>
          <h1>{title}</h1>
        </div>
        <Wave />
      </header>
      <main className="body">
        <div className="alert wait" role="note">
          <div>
            <b>טיוטה לבדיקה.</b> זהו נוסח בסיסי שהוכן כתבנית ועדיין לא אושר על ידי בעל העסק או עורך דין. יש לבדוק ולהתאים אותו לפני שימוש מחייב.
          </div>
        </div>
        <article className="surf pad legal">{children}</article>
        <p className="center small muted">
          <Link className="link" href="/terms">תנאי שימוש</Link> · <Link className="link" href="/privacy">מדיניות פרטיות</Link> · <Link className="link" href="/">דף הבית</Link>
        </p>
      </main>
    </div>
  );
}
