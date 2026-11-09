import { Phone } from "@/components/site/values";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { pageMetadata } from "@/server/seo";
import { getSiteData, isNoindex } from "@/server/site";
import { DEFAULT_LOCALE } from "@/i18n/locales";

// Statement required for a public service site under the Equal Rights for
// Persons with Disabilities (Service Accessibility) Regulations, 2013, and
// Israeli Standard 5568. The wording is a draft for legal review (open question Q7).
const UPDATED = "26/10/2026";

export async function generateMetadata() {
  const { t } = await getI18n();
  const { profile, settings } = await getSiteData();
  return pageMetadata(profile, { title: t("nav.accessibility"), path: "/accessibility" }, isNoindex(settings));
}

export default async function AccessibilityPage() {
  const { t, locale } = await getI18n();
  const { profile } = await getSiteData();
  // Written for Hebrew and English so far; any other language reads the default one.
  const Text = BODIES[locale] ?? BODIES[DEFAULT_LOCALE] ?? Hebrew;
  return (
    <article className="mx-auto max-w-3xl space-y-4 rounded-[20px] border border-line p-6 leading-relaxed md:rounded-card md:p-10">
      <h1 className="text-3xl font-bold md:text-4xl">{t("nav.accessibility")}</h1>
      <Text name={pick(locale, profile, "name")} phone={profile.phoneE164} />
    </article>
  );
}

type Body = { name: string; phone: string | null };

function Hebrew({ name, phone }: Body) {
  return (
    <>
      <p>
        {name} רואה חשיבות במתן שירות שוויוני לכל הלקוחות, ובכלל זה לאנשים עם מוגבלות. האתר נבנה כך שיהיה נגיש
        ככל האפשר, לפי תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע&quot;ג-2013, ולפי התקן הישראלי
        5568, ברמה AA.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">מה עשינו באתר</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>אפשר לנווט בכל האתר במקלדת בלבד, עם סימון ברור של הרכיב שבפוקוס.</li>
        <li>קישור &quot;דילוג לתוכן הראשי&quot; בראש כל דף.</li>
        <li>מבנה כותרות ותגיות שמתאים לקוראי מסך, וטקסט חלופי לתמונות.</li>
        <li>ניגודיות צבעים לפי רמה AA, וטקסט שאפשר להגדיל עד 200% בלי לאבד תוכן.</li>
        <li>טפסים עם תוויות, הודעות שגיאה כתובות, וסיכום שגיאות בראש הטופס.</li>
        <li>התוכן מוצג גם בלי JavaScript, ואין באתר רכיבים מהבהבים.</li>
        <li>האתר מכבד את הגדרת &quot;הפחתת תנועה&quot; של המכשיר.</li>
        <li>לא נעשה שימוש בתוסף נגישות חיצוני: ההתאמות בנויות בתוך הדפים.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">מגבלות ידועות</h2>
      <p>ייתכן שחלק מהתמונות בגלריה עדיין חסרות תיאור מלא. אם נתקלתם בתוכן שאינו נגיש, נשמח לדעת ולתקן.</p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">פנייה בנושא נגישות</h2>
      <p>
        אפשר לפנות אלינו בכל בעיה או בקשה בנושא נגישות האתר או המספרה
        {phone ? (
          <>
            {" "}
            בטלפון{" "}
            <a href={`tel:${phone}`} className="underline">
              <Phone e164={phone} />
            </a>
          </>
        ) : null}
        . נשתדל לענות תוך שבעה ימי עבודה.
      </p>

      <p className="text-ink-muted">
        ההצהרה עודכנה בתאריך <bdi>{UPDATED}</bdi>.
      </p>
    </>
  );
}

function English({ name, phone }: Body) {
  return (
    <>
      <p>
        {name} believes in giving equal service to every customer, including people with disabilities. This site is
        built to be as accessible as possible, following the Israeli Equal Rights for Persons with Disabilities
        (Service Accessibility Adjustments) Regulations, 2013, and Israeli Standard 5568 at level AA.
      </p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">What we did on this site</h2>
      <ul className="list-disc space-y-1 ps-6">
        <li>The whole site works with a keyboard alone, with a clear outline on the focused item.</li>
        <li>A &quot;Skip to main content&quot; link at the top of every page.</li>
        <li>Headings and labels that suit screen readers, and text alternatives for images.</li>
        <li>Colour contrast at level AA, and text that can be enlarged to 200% without losing content.</li>
        <li>Forms with labels, written error messages and an error summary at the top.</li>
        <li>Content shows without JavaScript, and nothing on the site flashes.</li>
        <li>The site respects the device&apos;s &quot;reduce motion&quot; setting.</li>
        <li>No outside accessibility plug-in is used: the adjustments are built into the pages.</li>
      </ul>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">Known limits</h2>
      <p>Some gallery photos may still lack a full description. If you find content that is not accessible, please tell us and we will fix it.</p>

      <h2 className="pt-2 text-xl font-bold md:text-2xl">Accessibility contact</h2>
      <p>
        You can contact us about any accessibility problem or request, on the site or at the salon
        {phone ? (
          <>
            {" "}
            by phone at{" "}
            <a href={`tel:${phone}`} className="underline">
              <Phone e164={phone} />
            </a>
          </>
        ) : null}
        . We aim to reply within seven working days.
      </p>

      <p className="text-ink-muted">
        This statement was last updated on <bdi>{UPDATED}</bdi>.
      </p>
    </>
  );
}

const BODIES: Record<string, typeof Hebrew | undefined> = { he: Hebrew, en: English };
