import Link from "next/link";
import type { ReactNode } from "react";
import { Wave } from "@/ui/primitives";

export function AuthFrame({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <div id="app" className="authwrap">
      <header className="band">
        <div className="topnav">
          <Link href="/" className="brand" aria-label="SWEEMER דף הבית">
            SWEEMER
          </Link>
        </div>
        <div className="bhead">
          <span className="k">{kicker}</span>
          <h1>{title}</h1>
        </div>
        <Wave />
      </header>
      <main className="surf authcard">{children}</main>
    </div>
  );
}
