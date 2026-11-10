import { afterEach, describe, expect, it } from "vitest";
import { getFeatures } from "@/core/platform/features";
import { getConfig, PROVIDER_KEYS, type ProviderName, providerMode, resetConfigForTests } from "@/core/platform/config";

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
    for (const keys of Object.values(PROVIDER_KEYS)) for (const key of keys) delete process.env[key];
    for (const name of Object.keys(PROVIDER_KEYS) as ProviderName[]) expect(providerMode(name)).toBe("off");
  });

  it("turns a service on only when all its keys are set", () => {
    process.env.PROVIDERS = "real";
    process.env.EMAIL_API_URL = "https://email.example.test";
    process.env.EMAIL_API_KEY = "test-key";
    process.env.EMAIL_FROM = "salon@example.test";
    expect(providerMode("email")).toBe("real");
    expect(providerMode("whatsapp")).toBe("off");
  });

  it("refuses a partly filled service, naming the missing keys", () => {
    process.env.PROVIDERS = "real";
    process.env.WHATSAPP_API_TOKEN = "test-token";
    expect(() => getConfig()).toThrow(/WHATSAPP_PHONE_NUMBER_ID: required to turn on whatsapp/);
  });

  it("fakes every service with PROVIDERS=fake", () => {
    expect(providerMode("whatsapp")).toBe("fake");
  });

  it("rejects a short session secret", () => {
    process.env.SESSION_SECRET = "short";
    expect(() => getConfig()).toThrow(/SESSION_SECRET/);
  });

  it("switches features off with their services: no WhatsApp or email means booking by phone", () => {
    process.env.PROVIDERS = "real";
    for (const keys of Object.values(PROVIDER_KEYS)) for (const key of keys) delete process.env[key];
    expect(getFeatures()).toEqual({
      onlineBooking: false,
      whatsappMessages: false,
      emailMessages: false,
      photoUploads: false,
      ownerPush: false,
    });
    resetConfigForTests();
    process.env.EMAIL_API_URL = "https://email.example.test";
    process.env.EMAIL_API_KEY = "test-key";
    process.env.EMAIL_FROM = "salon@example.test";
    expect(getFeatures()).toMatchObject({ onlineBooking: true, emailMessages: true, whatsappMessages: false });
  });
});
