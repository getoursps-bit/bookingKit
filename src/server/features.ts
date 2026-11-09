import { type Config, getConfig, providerMode } from "./config";

/**
 * What the site can offer with the services that are set up. Pages read this
 * instead of checking keys, so a missing service hides its feature rather
 * than failing.
 */
export type Features = {
  /** Booking online needs a way to send the code: WhatsApp or email. Otherwise "call the salon". */
  onlineBooking: boolean;
  /** Messages by WhatsApp; without it, email only (or none). */
  whatsappMessages: boolean;
  emailMessages: boolean;
  /** Uploading photos (gallery, products, pets) needs object storage. */
  photoUploads: boolean;
  ownerPush: boolean;
  /** AI also needs the owner's switches in settings; this says only that a key exists. */
  aiAvailable: boolean;
};

export function getFeatures(config: Config = getConfig()): Features {
  const on = (name: Parameters<typeof providerMode>[0]) => providerMode(name, config) !== "off";
  return {
    onlineBooking: on("whatsapp") || on("email"),
    whatsappMessages: on("whatsapp"),
    emailMessages: on("email"),
    photoUploads: on("storage"),
    ownerPush: on("push"),
    aiAvailable: on("ai"),
  };
}
