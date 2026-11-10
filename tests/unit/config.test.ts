import { afterEach, describe, expect, it } from "vitest";
import { getFeatures } from "@/core/platform/features";
import { ALL_PROVIDER_KEYS, getConfig, PROVIDER_NAMES, providerMode, resetConfigForTests } from "@/core/platform/config";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  resetConfigForTests();
});

describe("config", () => {
  it("accepts the fake-provider setup without provider keys", () => {
    expect(getConfig().PROVIDERS).toBe("fake");
  });

  it("starts with PROVIDERS=real and no keys, with every service off", () => {
    process.env.PROVIDERS = "real";
    for (const key of ALL_PROVIDER_KEYS) delete process.env[key];
    for (const name of PROVIDER_NAMES) expect(providerMode(name)).toBe("off");
  });

  it("turns a service on only when all its keys are set", () => {
    process.env.PROVIDERS = "real";
    process.env.EMAIL_API_URL = "https://email.example.test";
    process.env.EMAIL_API_KEY = "test-key";
    process.env.EMAIL_FROM = "salon@example.test";
    expect(providerMode("email")).toBe("real");
    expect(providerMode("messaging")).toBe("off");
  });

  it("refuses a partly filled service, naming the missing keys", () => {
    process.env.PROVIDERS = "real";
    process.env.WHATSAPP_API_TOKEN = "test-token";
    expect(() => getConfig()).toThrow(/WHATSAPP_PHONE_NUMBER_ID: required to turn on messaging/);
  });

  it("reads the keys of the chosen driver, and ignores those of another", () => {
    process.env.PROVIDERS = "real";
    for (const key of ALL_PROVIDER_KEYS) delete process.env[key];
    process.env.EMAIL_DRIVER = "smtp";
    process.env.EMAIL_API_URL = "https://email.example.test";
    process.env.EMAIL_FROM = "salon@example.test";
    process.env.SMTP_HOST = "mail.example.test";
    expect(() => getConfig()).toThrow(/SMTP_USER: required to turn on email/);
    resetConfigForTests();
    Object.assign(process.env, { SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "test-only" });
    expect(providerMode("email")).toBe("real");
    resetConfigForTests();
    process.env.MESSAGING_DRIVER = "twilio";
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "test-only", TWILIO_FROM: "whatsapp:+15550000000" });
    expect(providerMode("messaging")).toBe("real");
    resetConfigForTests();
    process.env.MESSAGING_DRIVER = "carrier-pigeon";
    expect(() => getConfig()).toThrow(/MESSAGING_DRIVER/);
  });

  it("fakes every service with PROVIDERS=fake", () => {
    expect(providerMode("messaging")).toBe("fake");
  });

  it("rejects a short session secret", () => {
    process.env.SESSION_SECRET = "short";
    expect(() => getConfig()).toThrow(/SESSION_SECRET/);
  });

  it("switches features off with their services: no WhatsApp or email means booking by phone", () => {
    process.env.PROVIDERS = "real";
    for (const key of ALL_PROVIDER_KEYS) delete process.env[key];
    expect(getFeatures()).toEqual({
      onlineBooking: false,
      messaging: false,
      emailMessages: false,
      photoUploads: false,
      ownerPush: false,
    });
    resetConfigForTests();
    process.env.EMAIL_API_URL = "https://email.example.test";
    process.env.EMAIL_API_KEY = "test-key";
    process.env.EMAIL_FROM = "salon@example.test";
    expect(getFeatures()).toMatchObject({ onlineBooking: true, emailMessages: true, messaging: false });
  });
});
