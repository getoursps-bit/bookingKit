import { petTags } from "@/components/site/cards";
import { BookCta, Faq, GalleryStrip, Hero, ServiceHighlight } from "@/components/site/landing";
import { pick } from "@/i18n/content";
import { getI18n } from "@/i18n/server";
import { listGallery, listServiceRules, listServices } from "@/server/repos/catalog";
import { getStorage } from "@/server/storage";
import type { LandingMeta } from ".";

// Example campaign page for Instagram dog-grooming posts: /l/dog-grooming.

export const meta: Record<string, LandingMeta> = {
  he: {
    title: "טיפוח לכלבים",
    description: "תספורת, רחצה וטיפוח לכלבים קטנים וגדולים. קובעים תור באתר תוך דקה.",
  },
  en: {
    title: "Dog grooming",
    description: "Haircuts, baths and grooming for small and large dogs. Book online in under a minute.",
  },
};

const COPY = {
  he: {
    title: "טיפוח לכלב שלכם, בלי לחכות בטלפון",
    text: "בוחרים שירות, רואים מה פנוי ומאשרים. אישור ותזכורת מגיעים בוואטסאפ.",
    services: "השירותים לכלבים",
    gallery: "כלבים שטיפלנו בהם",
    faq: [
      {
        q: "כמה זמן לוקח טיפול?",
        a: "כלב עד 10 קילו כשעה ו-20 דקות, כלב גדול יותר כשעה ו-40 דקות. אם מגיעים עם כמה כלבים, הם מטופלים אחד אחרי השני.",
      },
      { q: "לא בטוחים כמה הכלב שוקל?", a: 'בוחרים "לא בטוח" ואנחנו שומרים את הזמן הארוך יותר, ליתר ביטחון.' },
      { q: "אפשר לשנות או לבטל?", a: "כן, דרך הקישור שמגיע עם האישור, עד 12 שעות לפני התור." },
    ],
    ctaTitle: "מוכנים?",
    ctaText: "קביעת תור לוקחת פחות מדקה.",
  },
  en: {
    title: "Grooming for your dog, without waiting on the phone",
    text: "Pick a service, see what's free and confirm. The confirmation and reminder arrive on WhatsApp.",
    services: "Services for dogs",
    gallery: "Dogs we've groomed",
    faq: [
      {
        q: "How long does a visit take?",
        a: "A dog up to 10 kg takes about 1 hour 20 minutes, a larger dog about 1 hour 40 minutes. If you bring several dogs, they are groomed one after another.",
      },
      {
        q: "Not sure how much your dog weighs?",
        a: 'Choose "Not sure" and we keep the longer time, just in case.',
      },
      {
        q: "Can I change or cancel?",
        a: "Yes, with the link that comes with your confirmation, up to 12 hours before the appointment.",
      },
    ],
    ctaTitle: "Ready?",
    ctaText: "Booking takes less than a minute.",
  },
} as const;

export default async function DogGroomingLanding() {
  const { locale } = await getI18n();
  // Written in Hebrew and English; any other language reads the default one.
  const copy = (COPY as Record<string, (typeof COPY)[keyof typeof COPY] | undefined>)[locale] ?? COPY.he;
  const [services, rules, gallery] = await Promise.all([
    listServices({ activeOnly: true }),
    listServiceRules(),
    listGallery(),
  ]);
  const storage = getStorage();
  const tags = petTags(rules);
  const dogServices = services.filter((service) => {
    const tag = tags.get(service.id);
    return tag === "dog" || tag === "puppy" || tag === "both";
  });
  return (
    <>
      <Hero title={copy.title} text={copy.text} species="dog" />
      <ServiceHighlight title={copy.services} services={dogServices} tags={tags} />
      <GalleryStrip
        title={copy.gallery}
        items={gallery.map((image) => ({
          id: image.id,
          url: storage.publicUrl(image.storageKey),
          alt: pick(locale, image, "alt"),
          caption: pick(locale, image, "caption"),
        }))}
      />
      <Faq items={[...copy.faq]} />
      <BookCta title={copy.ctaTitle} text={copy.ctaText} species="dog" />
    </>
  );
}
