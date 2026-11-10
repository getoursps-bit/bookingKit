import { mapLink } from "@/core/platform/links";
import { defineViews } from "@/extension/views";
import { appleMapLink } from "./links";

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
