import { Fragment, type ReactNode } from "react";
import { extensionViews } from "@/extension/views";
import { Phone } from "@/views/parts/site/values";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { pageMetadata } from "@/core/website/seo";
import { getSiteData, isNoindex } from "@/core/website/site";
import { DEFAULT_LOCALE } from "@/i18n/locales";

// Privacy notice under the Protection of Privacy Law, 5741-1981. The wording is
// a draft for legal review (open question Q7); the facts match the design.
const UPDATED = "26/10/2026";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("nav.privacy"), path: "/privacy" }, isNoindex(settings));
}

export default async function PrivacyPage() {
  const { t, locale } = await getI18n();
  const { profile } = await getSiteData();
  // Written for Hebrew and English so far; any other language reads the default one.
  const written = BODIES[locale] ? locale : BODIES[DEFAULT_LOCALE] ? DEFAULT_LOCALE : "he";
  const Text = BODIES[written] ?? Hebrew;
  // What each extension adds to the notice's lists, in the language the notice is written in.
  const extra = (part: Part) => {
    const added = extensionViews().flatMap((views) => {
      const items = views.privacy?.({ part, language: written });
      return items ? [<Fragment key={views.id}>{items}</Fragment>] : [];
    });
    return added.length > 0 ? added : null;
  };
  return (
    <article className="mx-auto max-w-3xl space-y-4 rounded-[20px] border border-line p-6 leading-relaxed md:rounded-card md:p-10">
      <h1 className="text-3xl font-bold md:text-4xl">{t("nav.privacy")}</h1>
      <Text name={pick(locale, profile, "name")} phone={profile.phoneE164} extra={extra} />
    </article>
  );
}

type Part = "collected" | "shared" | "kept";
/** `extra` gives what the extensions add to one of the lists, or null when they add nothing. */
type Body = { name: string; phone: string | null; extra: (part: Part) => ReactNode };

function Hebrew({ name, phone, extra }: Body) {
  return (
    <>
      <p>
        כאן מוסבר איזה מידע {name} אוספת כשקובעים תור באתר, למה, עם מי הוא משותף, כמה זמן הוא נשמר ואיך מבקשים
        למחוק אותו.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">איזה מידע נאסף</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>שם ומספר טלפון. כתובת דוא&quot;ל, אם בחרתם למסור אותה.</li>
        {extra("collected")}
        <li>פרטי התורים: מועד, שירותים, ביטולים ושינויים.</li>
        <li>מאיזה קמפיין הגעתם לאתר (למשל קישור מאינסטגרם), אם הגעתם דרך קישור כזה.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">למה</h2>
      <p>
        כדי לקבוע את התור, לאמת את מספר הטלפון, לשלוח אישור ותזכורת, ולהכין את הטיפול. איננו משתמשים במידע לפרסום ואיננו
        מוכרים אותו.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">עם מי המידע משותף</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>
          הודעות וואטסאפ נשלחות דרך Meta (WhatsApp Business), שמעבדת את מספר הטלפון ואת תוכן ההודעה, גם בשרתים מחוץ
          לישראל.
        </li>
        <li>הודעות דוא&quot;ל, אם נדרשו, נשלחות דרך ספק דוא&quot;ל שעשוי לעבד את הכתובת מחוץ לישראל.</li>
        {extra("shared")}
        <li>שאר המידע נשמר בשרת של המספרה.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">כמה זמן המידע נשמר</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>קודי אימות נמחקים אחרי יום אחד.</li>
        {extra("kept") ?? <li>פרטי לקוח ותורים נשמרים כל עוד אתם לקוחות המספרה, או עד שתבקשו למחוק אותם.</li>}
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">עיון, תיקון ומחיקה</h2>
      <p>
        אפשר לבקש לראות את המידע השמור עליכם, לתקן אותו או למחוק אותו
        {phone ? (
          <>
            {" "}
            בטלפון{" "}
            <a href={`tel:${phone}`} className="underline">
              <Phone e164={phone} />
            </a>
          </>
        ) : null}
        . אחרי מחיקה נשארת רק רשומה ללא פרטים מזהים של התורים שהתקיימו, לצורך הנהלת החשבונות של המספרה.
      </p>

      <p className="text-ink-muted">
        המדיניות עודכנה בתאריך <bdi>{UPDATED}</bdi>.
      </p>
    </>
  );
}

function English({ name, phone, extra }: Body) {
  return (
    <>
      <p>
        This page explains what information {name} collects when you book on this site, why, who it is shared with,
        how long it is kept and how to ask for it to be deleted.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">What we collect</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>Your name and phone number. Your email address, if you choose to give it.</li>
        {extra("collected")}
        <li>Your appointments: times, services, cancellations and changes.</li>
        <li>Which campaign brought you to the site (for example an Instagram link), if you came through one.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">Why</h2>
      <p>
        To book your appointment, check your phone number, send a confirmation and a reminder, and prepare the
        grooming. We do not use the information for advertising and we do not sell it.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">Who it is shared with</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>
          WhatsApp messages are sent through Meta (WhatsApp Business), which handles your phone number and the message
          text, including on servers outside Israel.
        </li>
        <li>Emails, when needed, are sent through an email provider that may handle your address outside Israel.</li>
        {extra("shared")}
        <li>Everything else is kept on the salon&apos;s server.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">How long it is kept</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>Verification codes are deleted after one day.</li>
        {extra("kept") ?? <li>Customer and appointment details are kept while you are a customer, or until you ask us to delete them.</li>}
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">Seeing, correcting and deleting</h2>
      <p>
        You can ask to see the information we hold about you, correct it or delete it
        {phone ? (
          <>
            {" "}
            by phone at{" "}
            <a href={`tel:${phone}`} className="underline">
              <Phone e164={phone} />
            </a>
          </>
        ) : null}
        . After deletion, only a record of past appointments without identifying details is kept, for the
        salon&apos;s accounts.
      </p>

      <p className="text-ink-muted">
        This policy was last updated on <bdi>{UPDATED}</bdi>.
      </p>
    </>
  );
}

const BODIES: Record<string, typeof Hebrew | undefined> = { he: Hebrew, en: English };
