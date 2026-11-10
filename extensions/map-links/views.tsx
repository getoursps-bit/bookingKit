import { mapLink } from "@/core/platform/links";
import { defineViews } from "@/extension/views";

/** Apple Maps, the default maps app on iPhones, as a search for the address. */
export function appleMapLink(address: string | null | undefined): string | null {
  return address ? `https://maps.apple.com/?q=${encodeURIComponent(address)}` : null;
}

export default defineViews({
  id: "map-links",
  /** After Waze. The names are the apps' own, the same in every language. */
  contactLinks: ({ address, city }) => {
    // A maps app needs the street and the city; the street alone may match another town.
    const place = address ? [address, city].filter(Boolean).join(", ") : null;
    return [
      { key: "googleMaps", label: "Google Maps", icon: "map", href: mapLink(place) },
      { key: "appleMaps", label: "Apple Maps", icon: "map", href: appleMapLink(place) },
    ];
  },
});
