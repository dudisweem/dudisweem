import Link from "next/link";

// Landing for email links. AuthHashHandler (root layout) reads the #tokens and moves on;
// this page only shows if the link carried nothing usable.
export default function AuthHashPage() {
  return (
    <main id="app" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div className="surf pad stack center" style={{ maxWidth: 420 }}>
        <p style={{ margin: 0 }}>רגע, מאמתים את הקישור…</p>
        <Link className="link small" href="/login">לא קורה כלום? למסך ההתחברות</Link>
      </div>
    </main>
  );
}
