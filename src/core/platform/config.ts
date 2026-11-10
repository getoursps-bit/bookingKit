import { z } from "zod";

const optional = z.string().trim().min(1).optional();

/** The keys each outside service needs. */
export const PROVIDER_KEYS = {
  storage: ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"],
  whatsapp: [
    "WHATSAPP_API_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WEBHOOK_SECRET_MESSAGING",
    "WHATSAPP_VERIFY_TOKEN",
  ],
  email: ["EMAIL_API_URL", "EMAIL_API_KEY", "EMAIL_FROM"],
  push: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
} as const;

export type ProviderName = keyof typeof PROVIDER_KEYS;
/** fake: built-in stand-in (local and CI). real: keys set. off: not set up, so its features are switched off. */
export type ProviderMode = "fake" | "real" | "off";

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

    EMAIL_API_URL: optional,
    EMAIL_API_KEY: optional,
    EMAIL_FROM: optional,

    VAPID_PUBLIC_KEY: optional,
    VAPID_PRIVATE_KEY: optional,
    VAPID_SUBJECT: optional,
  })
  .superRefine((env, ctx) => {
    if (env.PROVIDERS !== "real") return;
    // Each service is all or nothing: every key set (on) or none set (off).
    // A partly filled service is almost always a typo, so it stops start-up.
    for (const [service, keys] of Object.entries(PROVIDER_KEYS)) {
      const missing = keys.filter((key) => !env[key]);
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
  return PROVIDER_KEYS[name].every((key) => config[key]) ? "real" : "off";
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
