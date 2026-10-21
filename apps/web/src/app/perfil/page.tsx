"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { HouseholdForm } from "@/components/HouseholdForm";
import { InstallButton } from "@/components/InstallButton";
import { Button, Field, Page, PageHeader, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import { db } from "@/lib/db";
import { saveHousehold, useHousehold } from "@/lib/household";
import { getSupabase } from "@/lib/supabase";
import { flush } from "@/lib/sync";

function Account() {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const pending = useLiveQuery(() => db.syncQueue.count(), []) ?? 0;

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) void flush();
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const syncStatus = (
    <p className="text-sm text-muted" data-testid="sync-status">
      {pending ? t.profile.pendingSync(pending) : t.profile.allSynced}
    </p>
  );

  if (!sb) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t.profile.noBackend}</p>
        {syncStatus}
      </div>
    );
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? t.common.error : t.profile.linkSent);
  }

  return (
    <div className="flex flex-col gap-3">
      {session ? (
        <>
          <p>
            {t.profile.signedInAs} <strong>{session.user.email}</strong>
          </p>
          <Button variant="secondary" onClick={() => void sb.auth.signOut()}>
            {t.profile.signOut}
          </Button>
        </>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t.profile.accountIntro}</p>
          <Field id="email" label={t.profile.email}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit">{t.profile.sendLink}</Button>
          {status ? <p role="status">{status}</p> : null}
        </form>
      )}
      {syncStatus}
    </div>
  );
}

export default function Perfil() {
  const household = useHousehold();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader title={t.profile.title} />
      <Page>
        <section aria-labelledby="household-title" className="flex flex-col gap-3">
          <h2 id="household-title" className="text-base font-semibold">
            {t.profile.household}
          </h2>
          {household ? (
            <HouseholdForm
              key={household.updatedAt}
              initial={household}
              submitLabel={t.profile.save}
              onSubmit={async (value) => {
                await saveHousehold(value);
                setSaved(true);
              }}
            />
          ) : null}
          {saved ? <p role="status">{t.profile.saved}</p> : null}
        </section>
        <section
          aria-labelledby="account-title"
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <h2 id="account-title" className="text-base font-semibold">
            {t.profile.account}
          </h2>
          <Account />
        </section>
        <section className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="text-base font-semibold">{t.profile.install}</h2>
          <InstallButton />
          <p className="text-sm text-muted">{t.profile.privacy}</p>
        </section>
        <nav
          aria-label={t.profile.legal}
          className="flex flex-col border-t border-border pt-4 text-sm"
        >
          <Link href="/metodologia" className="tap flex items-center text-brand underline">
            {t.profile.methodology}
          </Link>
          <Link href="/legal/aviso-legal" className="tap flex items-center text-brand underline">
            Aviso legal
          </Link>
          <Link href="/legal/privacidad" className="tap flex items-center text-brand underline">
            Privacidad
          </Link>
          <Link href="/legal/cookies" className="tap flex items-center text-brand underline">
            Cookies
          </Link>
        </nav>
      </Page>
    </>
  );
}
