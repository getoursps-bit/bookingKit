import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, savePublicPhoto, toWebp } from "@/server/photos";
import { getStorage } from "@/server/storage";

describe("toWebp", () => {
  it("drops camera metadata, keeps the picture upright and limits the width", async () => {
    const tagged = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#c2185b" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "camera owner", Copyright: "location tagged" } })
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const webp = await toWebp(tagged, 1600);
    const meta = await sharp(webp!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });

  it("returns null for bytes that are not an image", async () => {
    expect(await toWebp(new TextEncoder().encode("not an image"), 1600)).toBeNull();
  });
});

describe("savePublicPhoto", () => {
  const png = () =>
    sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#a86" } })
      .png()
      .toBuffer();

  it("stores a WebP at most 1600 px wide in the asked folder", async () => {
    const file = new File([new Uint8Array(await png())], "a.png", { type: "image/png" });
    const key = await savePublicPhoto(file, "products");
    expect(key).toMatch(/^products\/.+\.webp$/);
    const meta = await sharp((await getStorage().get(key!))!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
  });

  it("refuses a wrong type, a file that is too large and bytes that are not an image", async () => {
    const bytes = new Uint8Array(await png());
    expect(await savePublicPhoto(new File([bytes], "a.gif", { type: "image/gif" }), "gallery")).toBeNull();
    const large = new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], "a.jpg", { type: "image/jpeg" });
    expect(await savePublicPhoto(large, "gallery")).toBeNull();
    expect(await savePublicPhoto(new File(["not an image"], "a.jpg", { type: "image/jpeg" }), "gallery")).toBeNull();
  });
});
