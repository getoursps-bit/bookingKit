import { Alert } from "@/views/parts/ui/Alert";
import { isMessageKey } from "@/i18n/keys";
import { getI18n } from "@/i18n/server";
import type { MessageKey, Translate } from "@/i18n/t";

/** CSRF token, and on public forms the bot checks: an empty hidden field and the time the form was served. */
export async function FormSecrets({ csrf, renderedAt }: { csrf: string; renderedAt?: string }) {
  const { t } = await getI18n();
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      {renderedAt ? (
        <>
          <input type="hidden" name="renderedAt" value={renderedAt} />
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="website">{t("contact.website")}</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
        </>
      ) : null}
    </>
  );
}

/** The text for an error key from the address bar, or null for an unknown key. */
export function errorText(t: Translate, key: string | undefined): string | null {
  if (!key) return null;
  const full = `err.${key}`;
  return isMessageKey(full) ? t(full) : null;
}

// Kept here too so existing imports keep working; client code imports it from ui/Alert.
export { Alert };

const STEPS = ["service", "time", "contact", "code"] as const;
export type Step = (typeof STEPS)[number];

/** Where the customer is in the four steps. Finished steps link back. */
export async function Progress({ current }: { current: Step }) {
  const { t, lp } = await getI18n();
  const index = STEPS.indexOf(current);
  return (
    <nav aria-label={t("book.progress")} className="mb-6">
      <p className="mb-2 text-sm font-semibold text-ink-muted">{t("book.stepOf", { n: index + 1 })}</p>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const label = t(`book.step.${step}` as MessageKey);
          const bar = (
            <span aria-hidden="true" className={`block h-1.5 rounded-full ${i <= index ? "bg-brand" : "bg-line"}`} />
          );
          return (
            <li
              key={step}
              aria-current={i === index ? "step" : undefined}
              className="flex flex-col gap-1.5 text-xs font-semibold"
            >
              {bar}
              {i < index && step !== "code" ? (
                <a href={lp(`/book?step=${step}`)} className="underline-offset-2 hover:underline">
                  {label}
                </a>
              ) : (
                <span className={i === index ? "text-brand-strong" : "text-ink-muted"}>{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
