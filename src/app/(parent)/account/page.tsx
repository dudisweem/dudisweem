import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { ROLE_LABEL } from "@/domain/labels";
import { Icon } from "@/ui/Icon";
import { PasswordForm, ProfileForm } from "@/ui/parent/AccountForms";

export const metadata: Metadata = { title: "החשבון שלי" };

export default async function AccountPage() {
  const me = await requireRole("parent", "instructor", "admin");
  const settings = await getSettings();
  return (
    <Shell
      roles={["parent", "instructor", "admin"]}
      head={
        <Head kicker={ROLE_LABEL[me.role]} title={me.full_name || "החשבון שלי"}>
          <div className="facts"><span><Icon name="mail" small /><span dir="ltr">{me.email}</span></span></div>
        </Head>
      }
    >
      <ProfileForm fullName={me.full_name} phone={me.phone} email={me.email} />
      <PasswordForm />
      {settings.contact_phone || settings.contact_email ? (
        <div className="surf pad stack-s">
          <h2 style={{ margin: 0, font: "800 16px var(--f-ui)" }}>יצירת קשר עם בית הספר</h2>
          {settings.contact_phone ? <p className="row" style={{ margin: 0 }}><Icon name="send" small /><span dir="ltr">{settings.contact_phone}</span></p> : null}
          {settings.contact_email ? <p className="row" style={{ margin: 0 }}><Icon name="mail" small /><span dir="ltr">{settings.contact_email}</span></p> : null}
        </div>
      ) : null}
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn ghost full"><Icon name="left" />התנתקות</button>
      </form>
    </Shell>
  );
}
