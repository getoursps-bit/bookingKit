// Outbound links built from the salon's details. Each returns null when the
// detail is missing, so a page shows the button only when it works.

/** A wa.me chat link. wa.me wants the international number with no "+" and no leading 0. */
export function whatsappLink(numberE164: string | null | undefined, text?: string): string | null {
  if (!numberE164) return null;
  const digits = numberE164.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function phoneLink(numberE164: string | null | undefined): string | null {
  return numberE164 ? `tel:${numberE164.replace(/[^\d+]/g, "")}` : null;
}

export function wazeLink(address: string | null | undefined): string | null {
  return address ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : null;
}

export function mapLink(address: string | null | undefined): string | null {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

/** Social profile links are stored as full addresses; anything else is ignored. */
export function socialLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "053-123-4567" style for display; the E.164 value stays the link target. */
export function displayPhone(numberE164: string | null | undefined): string | null {
  if (!numberE164) return null;
  const local = numberE164.startsWith("+972") ? `0${numberE164.slice(4)}` : numberE164;
  const match = /^0(\d{2})(\d{3})(\d{4})$/.exec(local);
  return match ? `0${match[1]}-${match[2]}-${match[3]}` : local;
}

/**
 * Turns what a customer types (050-123-4567, 0501234567, +972 50 123 4567,
 * 972501234567) into E.164. Null when it is not a phone number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  let e164: string;
  if (/^0\d{8,9}$/.test(digits)) e164 = `+972${digits.slice(1)}`;
  else if (/^972\d{8,9}$/.test(digits)) e164 = `+${digits}`;
  else if (/^\+\d{8,15}$/.test(digits)) e164 = digits;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
