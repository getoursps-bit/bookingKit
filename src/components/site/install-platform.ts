export type InstallPlatform = "ios" | "macSafari" | "other";

/**
 * Which install steps fit this browser. iPad Safari calls itself a Mac, so it
 * is told apart by its touch screen. Every browser on iPhone and iPad installs
 * through the Share menu.
 */
export function installPlatform(userAgent: string, touchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (!/Macintosh/.test(userAgent)) return "other";
  if (touchPoints > 1) return "ios";
  return /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent) ? "macSafari" : "other";
}
