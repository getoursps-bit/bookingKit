/** Apple Maps, the default maps app on iPhones, as a search for the address. */
export function appleMapLink(address: string | null | undefined): string | null {
  return address ? `https://maps.apple.com/?q=${encodeURIComponent(address)}` : null;
}
