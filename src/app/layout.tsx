import type { Metadata, Viewport } from "next";
import { Assistant, Karantina } from "next/font/google";
import "./globals.css";

const assistant = Assistant({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-assistant" });
const karantina = Karantina({ subsets: ["hebrew", "latin"], weight: ["400", "700"], variable: "--font-karantina" });

export const metadata: Metadata = {
  title: { default: "SEA.D.CHANGE", template: "%s · SEA.D.CHANGE" },
  description: "בית ספר לשחייה, מיומנויות מים וחשיפה לקור — הזמנת שיעורים וניהול",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0E2F4B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${karantina.variable}`}>
      <body>{children}</body>
    </html>
  );
}
