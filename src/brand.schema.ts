import { z } from "zod";

// The shape of client.json: everything that makes the site one client's.
// Checked by the unit tests and by `pnpm brand`, not at run time, so this file
// (and zod) stays out of the browser bundle. Import the values from "@/brand".

/** The palette. Every text pair must pass WCAG AA (4.5:1); tests/unit/brand.test.ts checks the main ones. */
export const THEME_COLORS = {
  ink: "Main text.",
  "ink-soft": "Secondary text.",
  "ink-muted": "Hints and small print.",
  canvas: "The page itself. Cards are surface on it.",
  paper: "Alternate section bands, pills, chips and quiet backgrounds.",
  surface: "Cards and inputs.",
  placeholder: "Behind a photo that is missing or loading. A background only.",
  brand: "The accent: actions and the current choice.",
  "brand-strong": "Links, and the accent on hover.",
  "brand-deep": "Links on hover.",
  "brand-soft": "Behind the current choice.",
  "brand-ink": "Text on the accent.",
  "tint-pink": "Tint for photos and product cards.",
  "tint-pink-ink": "Text on that tint.",
  "tint-yellow": "Tint for photos and product cards.",
  "tint-yellow-ink": "Text on that tint.",
  "tint-mint": "Tint for photos and product cards.",
  "tint-mint-ink": "Text on that tint.",
  "tint-lilac": "Tint for photos and product cards.",
  "tint-lilac-ink": "Text on that tint.",
  peach: "Small neutral labels, so they never compete with actions.",
  "peach-soft": "A lighter neutral.",
  "peach-ink": "Text on the neutral labels.",
  line: "Card edges and dividers.",
  "line-strong": "A stronger edge.",
  "field-line": "The edge of a form field. Needs 3:1 against surface, so the field can be seen.",
  night: "The footer.",
  "night-ink": "Text on the footer.",
  "night-line": "Lines on the footer.",
} as const;

export type ThemeColor = keyof typeof THEME_COLORS;

/** Installed font packages (`@fontsource-variable/<key>`) and the family name each one defines. */
export const FONTS = {
  rubik: "Rubik Variable",
  fredoka: "Fredoka Variable",
  nunito: "Nunito Variable",
  heebo: "Heebo Variable",
  /** Arabic and Latin letters; no Hebrew. */
  alexandria: "Alexandria Variable",
} as const;

export type FontId = keyof typeof FONTS;

/** Icons that can be the brand mark. Closed shapes only: the app icon fills the shape. */
export const BRAND_MARKS = ["paw", "sparkle", "navigate", "chat"] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/, "a colour as #rrggbb in lower case");
const font = z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]);
const length = z.string().regex(/^(\d*\.)?\d+(rem|px)$/, "a length in rem or px");
const language = z.string().regex(/^[a-z]{2}$/, "a two-letter language code, the name of a folder in languages/");

/** languages/<code>/pack.json: what the code needs to know about one language. */
export const packSchema = z.strictObject({
  /** The language's own name, as the language switch shows it. */
  name: z.string().min(1),
  dir: z.enum(["rtl", "ltr"]),
  /** The locale for prices and numbers, for example "he-IL". */
  formats: z.string().min(2),
  /** The locale search engines and link previews are told, for example "he_IL". */
  openGraph: z.string().min(2),
  /** The name of this language in `date-fns/locale`, for day and month names. */
  dateFns: z.string().min(2),
});

export type Pack = z.infer<typeof packSchema>;

export const clientSchema = z
  .strictObject({
    /**
     * The languages of the site. The default one has the plain addresses and
     * is the language the owner writes in; each other one lives under /<code>.
     */
    languages: z.strictObject({ default: language, others: z.array(language) }),
    brand: z.strictObject({
      /** The business name per language: browser title, app name, emails, and the start value the owner can change. */
      name: z.record(language, z.string().min(1)),
      /** The icon shown where there is no logo, and on the app icon. */
      mark: z.enum(BRAND_MARKS),
      /** Wording that belongs to this client, per language: replaces the same keys of languages/<code>/messages.json. */
      messages: z.record(language, z.record(z.string(), z.string())),
    }),
    theme: z.strictObject({
      fonts: z.strictObject({
        /** Body text. */
        sans: font,
        /** Headings. Must have the letters of every language of the site. */
        display: font,
        /** Body text in a language that reads better in another font, by language code. */
        languages: z.record(language, font),
      }),
      colors: z.strictObject(
        Object.fromEntries(Object.keys(THEME_COLORS).map((key) => [key, hex])) as Record<ThemeColor, typeof hex>,
      ),
      radius: z.strictObject({
        /** Cards and photos. */
        card: length,
        /** Form fields, choices and time slots. */
        control: length,
        /** Messages and the day tiles of the booking calendar. */
        tile: length,
        /** The drawer that slides in over the owner's calendar. */
        panel: length,
        /** Buttons and chips. */
        pill: length,
      }),
      shadows: z.strictObject({ card: z.string().min(1), float: z.string().min(1), lift: z.string().min(1) }),
      /** The app icon: a two-colour gradient with the mark on it. */
      appIcon: z.strictObject({ from: hex, to: hex, mark: hex }),
    }),
  })
  .refine((client) => !client.languages.others.includes(client.languages.default), {
    message: "the default language must not also be listed in others",
    path: ["languages", "others"],
  })
  .refine((client) => client.languages.default in client.brand.name, {
    message: "the name is needed in the default language",
    path: ["brand", "name"],
  });

export type Client = z.infer<typeof clientSchema>;
