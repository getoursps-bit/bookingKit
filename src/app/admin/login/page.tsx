import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { brand } from "@/brand";
import { Alert } from "@/components/booking/parts";
import { SubmitButton } from "@/components/booking/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { LanguageSwitch } from "@/components/admin/LanguageSwitch";
import { getI18n } from "@/i18n/server";
import type { MessageKey, Translate } from "@/i18n/t";
import he from "@/i18n/he.json";
import { getFeatures } from "@/server/features";
import { CSRF_COOKIE } from "@/server/security";
import {
  EMAIL_CODE_TTL_MIN,
  EMAIL_PENDING_COOKIE,
  PENDING_COOKIE,
  resolveSession,
  SESSION_COOKIE,
} from "@/server/staff/auth";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("login.submit") };
}

function notice(t: Translate, prefix: "login.error" | "login.ok", key: string | undefined): string | null {
  const full = `${prefix}.${key}`;
  return key && full in he ? t(full as MessageKey) : null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; ok?: string }>;
}) {
  const search = await searchParams;
  const { t, locale } = await getI18n();
  const jar = await cookies();
  if (await resolveSession(jar.get(SESSION_COOKIE)?.value)) redirect("/admin");
  const csrf = jar.get(CSRF_COOKIE)?.value ?? "";
  // Two ways in: password then app code (the default), or a code by email
  // when email is set up.
  const emailOn = getFeatures().emailMessages;
  const step =
    search.step === "code" && jar.has(PENDING_COOKIE)
      ? "code"
      : search.step === "emailcode" && emailOn && jar.has(EMAIL_PENDING_COOKIE)
        ? "emailcode"
        : search.step === "email" && emailOn
          ? "email"
          : "password";
  const codeStep = step === "code" || step === "emailcode";
  const error = notice(t, "login.error", search.error);
  const ok =
    search.ok === "sent" && step === "emailcode"
      ? t("login.emailSent", { minutes: EMAIL_CODE_TTL_MIN })
      : notice(t, "login.ok", search.ok);
  const title = {
    password: t("login.title"),
    code: t("login.codeTitle"),
    email: t("login.emailTitle"),
    emailcode: t("login.emailCodeTitle"),
  }[step];

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand text-brand-ink">
          <Icon name={brand.mark} size={24} />
        </span>
        <h1 className="text-2xl font-extrabold">{title}</h1>
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="ok">{ok}</Alert> : null}
      <form method="post" action="/api/admin/auth" className="card flex flex-col gap-4 p-5">
        <input type="hidden" name="csrf" value={csrf} />
        {step === "email" ? (
          <>
            <input type="hidden" name="action" value="emailSend" />
            <input type="hidden" name="locale" value={locale} />
            <p className="text-sm text-ink-soft">{t("login.emailHelp")}</p>
            <div className="field">
              <label htmlFor="email" className="field-label">
                {t("login.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                dir="ltr"
                className="input"
                required
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <SubmitButton className="btn btn-primary">{t("login.sendCode")}</SubmitButton>
          </>
        ) : codeStep ? (
          <>
            <input type="hidden" name="action" value={step === "emailcode" ? "emailCode" : "code"} />
            <div className="field">
              <label htmlFor="code" className="field-label">
                {t("login.code")}
              </label>
              <input
                id="code"
                name="code"
                dir="ltr"
                className="input text-center text-2xl font-bold tracking-[0.4em]"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
              />
            </div>
            <SubmitButton className="btn btn-primary">{t("login.submit")}</SubmitButton>
          </>
        ) : (
          <>
            <input type="hidden" name="action" value="password" />
            <div className="field">
              <label htmlFor="email" className="field-label">
                {t("login.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                dir="ltr"
                className="input"
                required
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="password" className="field-label">
                {t("login.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                dir="ltr"
                className="input"
                required
                autoComplete="current-password"
              />
            </div>
            <SubmitButton className="btn btn-primary">{t("login.next")}</SubmitButton>
          </>
        )}
      </form>
      {step === "emailcode" ? (
        <a href="/admin/login?step=email" className="self-center text-sm font-semibold underline">
          {t("login.resend")}
        </a>
      ) : null}
      {emailOn && step !== "code" ? (
        <a
          href={step === "password" ? "/admin/login?step=email" : "/admin/login"}
          className="btn btn-secondary min-h-12"
        >
          {step === "password" ? t("login.emailOption") : t("login.passwordOption")}
        </a>
      ) : null}
      <LanguageSwitch
        locale={locale}
        back={step === "password" ? "/admin/login" : `/admin/login?step=${step}`}
        className="self-center text-sm font-semibold underline"
      />
    </main>
  );
}
