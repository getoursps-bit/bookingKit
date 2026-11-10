"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/views/parts/ui/Icon";
import { useI18n } from "@/i18n/client";
import { isolate } from "@/i18n/t";
import { SubmitButton } from "./SubmitButton";

const RESEND_AFTER_S = 30;

/**
 * Step 4: the one-time code. After 30 seconds it offers sending the code by
 * email (asking for an address when none was given) or again by WhatsApp,
 * and the salon's number.
 * Without JavaScript the same offers show once the page is reloaded.
 */
export function CodeStep({
  csrf,
  secondsSinceSent,
  hasEmail,
  codeChannel,
  emailChange,
  whatsappOn,
  emailOn,
  callHref,
  callLabel,
  errorId,
}: {
  csrf: string;
  /** Null when no code went out, so the alternatives show at once. */
  secondsSinceSent: number | null;
  hasEmail: boolean;
  codeChannel: "messaging" | "email" | null;
  /** The phone already has a verified email (masked) and another was typed. */
  emailChange: { onFile: string; typed: string } | null;
  whatsappOn: boolean;
  emailOn: boolean;
  callHref: string | null;
  callLabel: string | null;
  errorId?: string;
}) {
  const { t } = useI18n();
  const initialWait = secondsSinceSent === null ? 0 : Math.max(0, RESEND_AFTER_S - secondsSinceSent);
  const [wait, setWait] = useState(initialWait);
  useEffect(() => {
    if (initialWait <= 0) return;
    // Counts against a fixed deadline, so a busy or sleeping tab does not slow it down.
    const deadline = Date.now() + initialWait * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setWait(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [initialWait]);

  return (
    <div className="flex flex-col gap-6">
      {secondsSinceSent !== null ? (
        <form method="post" action="/api/booking/verify" className="card flex flex-col gap-5 p-5">
          <input type="hidden" name="csrf" value={csrf} />
          <div className="field">
            <label htmlFor="code" className="field-label">
              {t("code.label")}
            </label>
            <input
              id="code"
              name="code"
              type="text"
              dir="ltr"
              className="input max-w-56 text-center text-2xl font-bold tracking-[0.4em]"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              enterKeyHint="done"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby={errorId ? `${errorId} code-help` : "code-help"}
              aria-invalid={errorId ? true : undefined}
            />
            <p id="code-help" className="field-help">
              {t("code.help")}
            </p>
          </div>
          {emailChange ? (
            <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
              <p>{t("code.emailOnFile", { email: isolate(emailChange.onFile) })}</p>
              <label className="flex items-start gap-2 font-medium">
                <input type="checkbox" name="replaceEmail" defaultChecked className="mt-1 size-5 shrink-0 accent-brand" />
                <span>{t("code.replaceEmail", { email: isolate(emailChange.typed) })}</span>
              </label>
            </div>
          ) : null}
          <SubmitButton className="btn btn-primary min-h-12 self-stretch sm:self-start sm:px-8">
            <Icon name="check" />
            {t("code.submit")}
          </SubmitButton>
        </form>
      ) : null}

      <section aria-labelledby="no-code" className="card p-5">
        <h2 id="no-code" className="mb-3 font-bold">
          {t("code.noArrive")}
        </h2>
        {wait > 0 ? (
          <p className="text-ink-muted" aria-live="off">
            {t("code.wait", { seconds: wait })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emailOn && hasEmail ? (
              <form method="post" action="/api/booking/resend">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="channel" value="email" />
                <SubmitButton className="btn btn-secondary">
                  <Icon name="chat" />
                  {t("code.byEmail")}
                </SubmitButton>
              </form>
            ) : null}
            {emailOn && !hasEmail ? (
              <form method="post" action="/api/booking/resend" className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="channel" value="email" />
                <div className="field flex-1">
                  <label htmlFor="code-email" className="field-label">
                    {t("code.emailLabel")}
                  </label>
                  <input
                    id="code-email"
                    name="email"
                    type="email"
                    dir="ltr"
                    className="input"
                    required
                    autoComplete="email"
                    inputMode="email"
                    maxLength={200}
                  />
                </div>
                <SubmitButton className="btn btn-secondary">
                  <Icon name="chat" />
                  {t("code.byEmail")}
                </SubmitButton>
              </form>
            ) : null}
            {whatsappOn ? (
              <form method="post" action="/api/booking/resend">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="channel" value="messaging" />
                <SubmitButton className="btn btn-secondary">
                  <Icon name="chat" />
                  {/* When the code went to an email the customer cannot open, offer the phone plainly. */}
                  {codeChannel === "email" ? t("code.toPhone") : t("code.again")}
                </SubmitButton>
              </form>
            ) : null}
            {callHref ? (
              <a href={callHref} className="btn btn-secondary">
                <Icon name="phone" />
                {t("code.orCall")}
                {callLabel ? <bdi dir="ltr">{callLabel}</bdi> : null}
              </a>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
