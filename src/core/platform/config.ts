import { z } from "zod";

const optional = z.string().trim().min(1).optional();

/**
 * The drivers of each notification channel and the keys each one needs. A
 * channel has one driver at a time, picked by MESSAGING_DRIVER or
 * EMAIL_DRIVER; the code that sends is in src/core/platform/notify/drivers/.
 */
export const DRIVER_KEYS = {
  messaging: {
    /** WhatsApp straight from Meta's Cloud API. */
    meta: [
      "WHATSAPP_API_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "WEBHOOK_SECRET_MESSAGING",
      "WHATSAPP_VERIFY_TOKEN",
    ],
    /** WhatsApp or SMS through Twilio. */
    twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
  },
  email: {
    /** An email service with an HTTPS send API. */
    http: ["EMAIL_API_URL", "EMAIL_API_KEY", "EMAIL_FROM"],
    /** Any SMTP server: the client's own, or a mail service's. */
    smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"],
    /** A Gmail or Google Workspace mailbox, with an app password. */
    gmail: ["GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_FROM"],
  },
  push: {
    /** Browser push with VAPID keys. */
    webpush: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  },
} as const;

const STORAGE_KEYS = ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const;

export type NotifyChannel = keyof typeof DRIVER_KEYS;
export const PROVIDER_NAMES = ["storage", "messaging", "email", "push"] as const;

/** Every key of every service and driver, for tests that clear them. */
export const ALL_PROVIDER_KEYS: readonly string[] = [
  ...STORAGE_KEYS,
  ...Object.values(DRIVER_KEYS).flatMap((drivers) => Object.values(drivers).flat()),
];

export type ProviderName = (typeof PROVIDER_NAMES)[number];
/** fake: built-in stand-in (local and CI). real: keys set. off: not set up, so its features are switched off. */
export type ProviderMode = "fake" | "real" | "off";

type Env = Record<string, unknown> & { MESSAGING_DRIVER: "meta" | "twilio"; EMAIL_DRIVER: "http" | "smtp" | "gmail" };

/** The driver a channel uses. */
export function driverOf(channel: NotifyChannel, env: Env = getConfig()): string {
  if (channel === "messaging") return env.MESSAGING_DRIVER;
  if (channel === "email") return env.EMAIL_DRIVER;
  return "webpush";
}

function keysOf(service: ProviderName, env: Env): readonly string[] {
  if (service === "storage") return STORAGE_KEYS;
  return (DRIVER_KEYS[service] as Record<string, readonly string[]>)[driverOf(service, env)]!;
}

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    HEALTH_PATH: z.literal("/healthz").default("/healthz"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    PROVIDERS: z.enum(["fake", "real"]).default("fake"),
    DATABASE_URL: z.string().startsWith("postgres"),

    STORAGE_ENDPOINT: optional,
    STORAGE_BUCKET: optional,
    STORAGE_ACCESS_KEY: optional,
    STORAGE_SECRET_KEY: optional,

    WHATSAPP_API_TOKEN: optional,
    WHATSAPP_PHONE_NUMBER_ID: optional,
    WHATSAPP_BUSINESS_ACCOUNT_ID: optional,
    WEBHOOK_SECRET_MESSAGING: optional,
    WHATSAPP_VERIFY_TOKEN: optional,

    MESSAGING_DRIVER: z.enum(["meta", "twilio"]).default("meta"),
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_FROM: optional,

    EMAIL_DRIVER: z.enum(["http", "smtp", "gmail"]).default("http"),
    EMAIL_API_URL: optional,
    EMAIL_API_KEY: optional,
    EMAIL_FROM: optional,
    SMTP_HOST: optional,
    SMTP_PORT: optional,
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    GMAIL_USER: optional,
    GMAIL_APP_PASSWORD: optional,

    VAPID_PUBLIC_KEY: optional,
    VAPID_PRIVATE_KEY: optional,
    VAPID_SUBJECT: optional,
  })
  .superRefine((env, ctx) => {
    if (env.PROVIDERS !== "real") return;
    // Each service is all or nothing: every key of its driver set (on) or
    // none set (off). A partly filled service is almost always a typo, so it
    // stops start-up. Keys of a driver that is not the chosen one are ignored.
    for (const service of PROVIDER_NAMES) {
      const keys = keysOf(service, env);
      const missing = keys.filter((key) => !(env as Record<string, unknown>)[key]);
      if (missing.length === 0 || missing.length === keys.length) continue;
      for (const key of missing) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `required to turn on ${service} (the other ${service} keys are set)`,
        });
      }
    }
  });

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

/**
 * Reads and checks the environment once. Called lazily so `next build` works
 * without runtime secrets; a missing variable fails on first use with a list
 * of every problem.
 */
export function getConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** How each outside service runs. With PROVIDERS=real, a service without keys is off, not faked. */
export function providerMode(name: ProviderName, config: Config = getConfig()): ProviderMode {
  if (config.PROVIDERS === "fake") return "fake";
  return keysOf(name, config).every((key) => (config as Record<string, unknown>)[key]) ? "real" : "off";
}

/**
 * The same for an outside service an extension brings, from the names of its
 * own environment variables. It follows the same rule: all set (real), none
 * set (off), and a partly filled service is an error.
 */
export function serviceMode(
  keys: readonly string[],
  env: Record<string, string | undefined> = process.env,
  config: Config = getConfig(),
): ProviderMode {
  if (config.PROVIDERS === "fake") return "fake";
  const missing = keys.filter((key) => !env[key]?.trim());
  if (missing.length === 0) return "real";
  if (missing.length === keys.length) return "off";
  throw new Error(`Invalid environment configuration:\n${missing.map((key) => `  ${key}: required (the other keys of this service are set)`).join("\n")}`);
}

/** Test hook: forget the cached config so a test can change process.env. */
export function resetConfigForTests(): void {
  cached = undefined;
}
