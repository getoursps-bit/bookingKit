import { Fragment } from "react";
import { Icon } from "@/views/parts/ui/Icon";
import { extensionViews } from "@/extension/views";
import { getI18n } from "@/i18n/server";
import { FormSecrets } from "./parts";
import { SubmitButton } from "./SubmitButton";

/** One line of the booking on the details step: its service, and what each extension was told about it before. */
export type LineFields = { serviceId: number; serviceName: string; typed: Record<string, unknown> };

/**
 * Step 3, the last before the code: what the extensions ask about each line
 * (for example a pet's details), then name and mobile number (required) and email (optional, only for the fallback; required when
 * WhatsApp is not set up, since the code goes by email). Sending the form
 * takes the slot and sends the code.
 */
export async function ContactStep({
  csrf,
  renderedAt,
  summary,
  lines,
  errorField,
  emailRequired = false,
}: {
  csrf: string;
  renderedAt: string;
  summary: string;
  lines: LineFields[];
  errorField?: "name" | "phone" | "email";
  /** True when WhatsApp is off: the code can only go by email. */
  emailRequired?: boolean;
}) {
  const { t } = await getI18n();
  const invalid = (field: string) =>
    errorField === field ? { "aria-invalid": true as const, "aria-describedby": "contact-error" } : {};
  return (
    <form method="post" action="/api/booking/hold" className="card flex flex-col gap-5 p-5">
      <FormSecrets csrf={csrf} renderedAt={renderedAt} />
      <p className="chip w-fit">
        <Icon name="calendar" size={16} />
        {summary}
      </p>
      {extensionViews().flatMap((views) =>
        views.lineFields
          ? lines.map((line, index) => (
              <Fragment key={`${views.id}:${index}`}>
                {views.lineFields!({
                  index,
                  count: lines.length,
                  serviceId: line.serviceId,
                  serviceName: line.serviceName,
                  typed: line.typed[views.id],
                })}
              </Fragment>
            ))
          : [],
      )}
      <h3 className="text-lg font-bold">{t("details.contactTitle")}</h3>
      <div className="field">
        <label htmlFor="name" className="field-label">
          {t("contact.name")}
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          maxLength={80}
          autoComplete="name"
          enterKeyHint="next"
          {...invalid("name")}
        />
      </div>
      <div className="field">
        <label htmlFor="phone" className="field-label">
          {t("contact.phone")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          className="input text-end"
          required
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          pattern="[\d\s\-+().]{9,20}"
          aria-describedby={errorField === "phone" ? "contact-error phone-help" : "phone-help"}
          aria-invalid={errorField === "phone" || undefined}
        />
        <p id="phone-help" className="field-help">
          {t("contact.phoneHelp")}
        </p>
      </div>
      <div className="field">
        <label htmlFor="email" className="field-label">
          {t(emailRequired ? "contact.emailRequired" : "contact.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          className="input text-end"
          maxLength={200}
          required={emailRequired}
          autoComplete="email"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-describedby={errorField === "email" ? "contact-error email-help" : "email-help"}
          aria-invalid={errorField === "email" || undefined}
        />
        <p id="email-help" className="field-help">
          {t(emailRequired ? "contact.emailRequiredHelp" : "contact.emailHelp")}
        </p>
      </div>
      <SubmitButton className="btn btn-primary min-h-12 self-stretch sm:self-start sm:px-8">
        <Icon name="chat" />
        {t("contact.submit")}
      </SubmitButton>
    </form>
  );
}
