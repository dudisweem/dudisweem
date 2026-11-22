import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { Icon, type IconName } from "@/ui/Icon";

export const metadata: Metadata = { title: "ניהול" };

const CARDS: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: "/admin/settings", icon: "pen", title: "הגדרות בית הספר", text: "פרטי קשר, מדיניות ביטול, חלון הזמנה, אישור בקשות, תשלומים, הצהרת בריאות" },
  { href: "/admin/services", icon: "waves", title: "סוגי שיעורים ומחירים", text: "מחיר לשיעור, משך, קיבולת, גילאים, מה הורים יכולים להזמין" },
  { href: "/admin/schedule", icon: "clock", title: "שעות עבודה וחסימות", text: "ימים ושעות זמינות לכל מדריך, חופשות, חגים וסגירת בריכה" },
  { href: "/admin/users", icon: "user", title: "משתמשים והרשאות", text: "הפיכת משתמש למדריך או מנהל, השהיית חשבון, פרטי צוות" },
  { href: "/admin/packages", icon: "card", title: "כרטיסיות", text: "חבילות שיעורים: כמות, מחיר ותוקף" },
  { href: "/admin/payments", icon: "wallet", title: "תשלומים", text: "מה שולם ומה פתוח, סיכום חודשי" },
  { href: "/admin/reports", icon: "chart", title: "דוחות", text: "הכנסות, נוכחות, ביטולים, ימים ושעות עמוסים, מדריכים ומשפחות חדשות" },
  { href: "/admin/skills", icon: "check", title: "מיומנויות והתקדמות", text: "רשימת המיומנויות שהמדריכים מסמנים לכל חניך" },
  { href: "/admin/announcements", icon: "flag", title: "הודעות להורים", text: "עדכונים שמופיעים בדף הבית של ההורים" },
  { href: "/pool", icon: "waves", title: "מסך בריכה", text: "תצוגה לטאבלט או מסך גדול: השיעור הקודם, מי עכשיו במים ומי הבא" },
];

export default function ManageHub() {
  return (
    <Shell roles={["admin"]} head={<Head kicker="כל מה שאפשר לשנות" title="ניהול" />}>
      <nav className="hub" aria-label="אזורי ניהול">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="surf">
            <Icon name={c.icon} />
            <b>{c.title}</b>
            <small>{c.text}</small>
          </Link>
        ))}
      </nav>
    </Shell>
  );
}
