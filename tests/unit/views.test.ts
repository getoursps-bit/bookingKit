import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function pages(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(path.join(dir, entry.name))
      : /^(page|layout|not-found)\.tsx$/.test(entry.name)
        ? [path.join(dir, entry.name)]
        : [],
  );
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../theme/views");
});

describe("views", () => {
  it("a view is the kit's unless the client lists its own", async () => {
    const { view } = await import("@/views");
    const { KIT_VIEWS } = await import("@/views/kit");
    expect(view("site.services")).toBe(KIT_VIEWS["site.services"]);

    vi.resetModules();
    const Mine = async () => null;
    vi.doMock("../../theme/views", () => ({ default: { "site.services": Mine } }));
    const replaced = await import("@/views");
    expect(replaced.view("site.services")).toBe(Mine);
    expect(replaced.view("site.home")).not.toBe(Mine);
  });

  it("every page and frame under src/app is a thin route to a named view", () => {
    // The root layout is the html shell, and the owner area's outer layout only sets its title.
    const shells = ["src/app/layout.tsx", "src/app/admin/layout.tsx"];
    const thick = pages("src/app").filter(
      (file) => !shells.includes(file) && !/const View = view\("[a-z]+\.[A-Za-z]+"\);/.test(readFileSync(path.join(ROOT, file), "utf8")),
    );
    expect(thick).toEqual([]);
  });
});
