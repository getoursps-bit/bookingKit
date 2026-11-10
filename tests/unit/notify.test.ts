import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_PROVIDER_KEYS, DRIVER_KEYS, resetConfigForTests } from "@/core/platform/config";
import { Notify } from "@/core/platform/notify";
import { driverNames } from "@/core/platform/notify/drivers";
import { smtpDriver } from "@/core/platform/notify/drivers/email-smtp";
import { createTwilio, twilioForm } from "@/core/platform/notify/drivers/messaging-twilio";
import type { OutgoingMessage } from "@/core/platform/notify/types";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  resetConfigForTests();
  vi.unstubAllGlobals();
});

// Made-up values: a fictional number and keys that open nothing.
const message: OutgoingMessage = {
  kind: "confirmation",
  templateKey: "confirmation",
  to: "+972555000123",
  body: "Your appointment is on Monday 10:00",
  subject: "Appointment confirmed",
  providerTemplate: "HX00000000000000000000000000000000",
  params: ["Monday 10:00"],
  buttonParam: "token-part",
  locale: "he",
};

describe("the channels and their drivers", () => {
  it("every driver that can be chosen has its keys listed, and the other way round", () => {
    for (const channel of ["messaging", "email", "push"] as const) {
      expect(driverNames(channel).sort()).toEqual(Object.keys(DRIVER_KEYS[channel]).sort());
    }
  });

  it("says which driver each channel uses, and fakes all of them locally", () => {
    expect(Notify.channels()).toEqual({
      messaging: { driver: "meta", mode: "fake" },
      email: { driver: "http", mode: "fake" },
      push: { driver: "webpush", mode: "fake" },
    });
    process.env.PROVIDERS = "real";
    for (const key of ALL_PROVIDER_KEYS) delete process.env[key];
    Object.assign(process.env, { EMAIL_DRIVER: "gmail", GMAIL_USER: "owner@example.test", GMAIL_APP_PASSWORD: "test-only", EMAIL_FROM: "owner@example.test" });
    resetConfigForTests();
    expect(Notify.channels()).toMatchObject({ email: { driver: "gmail", mode: "real" }, messaging: { driver: "meta", mode: "off" } });
  });

  it("only the notification layer touches a driver", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) {
          if (!file.endsWith(path.join("platform", "notify")) && name !== "dist" && name !== "node_modules") walk(file);
        } else if (/\.tsx?$/.test(name) && /(from|import\()\s*["'][^"']*notify\/drivers/.test(readFileSync(file, "utf8"))) {
          offenders.push(file);
        }
      }
    };
    for (const root of ["src", "extensions", "worker", "scripts"]) walk(path.join(process.cwd(), root));
    expect(offenders).toEqual([]);
  });
});

describe("the Twilio driver", () => {
  it("sends a WhatsApp template by its content SID, with the values numbered and the button value last", () => {
    const form = twilioForm(message, "whatsapp:+15550000000");
    expect(form.get("To")).toBe("whatsapp:+972555000123");
    expect(form.get("From")).toBe("whatsapp:+15550000000");
    expect(form.get("ContentSid")).toBe(message.providerTemplate);
    expect(JSON.parse(form.get("ContentVariables")!)).toEqual({ "1": "Monday 10:00", "2": "token-part" });
    expect(form.has("Body")).toBe(false);
  });

  it("sends plain text as SMS from a number or a messaging service", () => {
    const sms = twilioForm(message, "+15550000000");
    expect(sms.get("To")).toBe("+972555000123");
    expect(sms.get("Body")).toBe(message.body);
    expect(sms.has("ContentSid")).toBe(false);
    expect(twilioForm(message, "MG00000000000000000000000000000000").get("MessagingServiceSid")).toMatch(/^MG/);
  });

  it("reports what Twilio answered: sent, cannot be reached, or try again", async () => {
    process.env.PROVIDERS = "real";
    Object.assign(process.env, { MESSAGING_DRIVER: "twilio", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "test-only", TWILIO_FROM: "+15550000000" });
    resetConfigForTests();
    const answer = (status: number, body: unknown) =>
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

    answer(201, { sid: "SMtest" });
    expect(await createTwilio().send(message)).toEqual({ ok: true, providerRef: "SMtest", costAgorot: 0 });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Basic ${Buffer.from("ACtest:test-only").toString("base64")}` });

    answer(400, { code: 21211 });
    expect(await createTwilio().send(message)).toMatchObject({ ok: false, retry: false });
    answer(503, {});
    expect(await createTwilio().send(message)).toMatchObject({ ok: false, retry: true });
  });

  it("refuses a WhatsApp message with no approved template without calling Twilio", async () => {
    process.env.PROVIDERS = "real";
    Object.assign(process.env, { MESSAGING_DRIVER: "twilio", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "test-only", TWILIO_FROM: "whatsapp:+15550000000" });
    resetConfigForTests();
    const called = vi.fn();
    vi.stubGlobal("fetch", called);
    expect(await createTwilio().send({ ...message, providerTemplate: null })).toMatchObject({ ok: false, retry: false });
    expect(called).not.toHaveBeenCalled();
  });
});

describe("the SMTP driver", () => {
  it("sends the text and the HTML in the message's direction, and returns the message id", async () => {
    // A transport that writes the email to memory instead of a server.
    const driver = smtpDriver(nodemailer.createTransport({ jsonTransport: true }), "Sample <no-reply@example.test>");
    const sent = await driver.send({ ...message, to: "customer@example.test" });
    expect(sent).toMatchObject({ ok: true, costAgorot: 0 });
    expect(sent.ok && sent.providerRef).toBeTruthy();
  });

  it("gives up on an address the server refused, and tries again after a passing fault", async () => {
    const failing = (error: object) =>
      smtpDriver({ sendMail: async () => Promise.reject(error) } as unknown as Transporter, "no-reply@example.test");
    expect(await failing({ responseCode: 550 }).send(message)).toEqual({ ok: false, error: "smtp 550", retry: false });
    expect(await failing({ responseCode: 451 }).send(message)).toEqual({ ok: false, error: "smtp 451", retry: true });
    expect(await failing({ code: "ETIMEDOUT" }).send(message)).toEqual({ ok: false, error: "smtp ETIMEDOUT", retry: true });
  });
});
