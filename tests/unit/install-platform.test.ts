import { describe, expect, it } from "vitest";
import { installPlatform } from "@/components/site/install-platform";

const SAFARI = "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${SAFARI}`;

describe("installPlatform", () => {
  it("finds iPhones in any browser", () => {
    expect(installPlatform(`Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ${SAFARI}`, 5)).toBe("ios");
    expect(installPlatform("Mozilla/5.0 (iPhone) CriOS/130.0 Mobile Safari/604.1", 5)).toBe("ios");
  });

  it("finds an iPad that calls itself a Mac by its touch screen", () => {
    expect(installPlatform(MAC, 5)).toBe("ios");
  });

  it("tells Safari on a Mac from other Mac browsers", () => {
    expect(installPlatform(MAC, 0)).toBe("macSafari");
    expect(installPlatform("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", 0)).toBe("other");
  });

  it("gives everything else the general steps", () => {
    expect(installPlatform("Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36", 5)).toBe("other");
  });
});
