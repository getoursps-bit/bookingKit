import { firstWith } from "@/extension/registry";
import type { Locale } from "@/i18n/locales";
import type { Service } from "./catalog";

/**
 * The short label an extension puts on each service, and its filter of the
 * service list. With no such extension, no labels and nothing filtered.
 */
export async function serviceTags(locale: Locale) {
  const point = firstWith("serviceTags");
  const loaded = await point?.load(locale);
  return {
    /** The address parameter that narrows the list, if there is one. */
    param: point?.param,
    label: (service: Service): string | undefined => loaded?.label(service.id),
    /** The services left when the list is narrowed to `value`. */
    narrow: (services: Service[], value: string | undefined): Service[] =>
      loaded && value && point?.param?.values.includes(value)
        ? services.filter((service) => loaded.matches(service.id, value))
        : services,
  };
}

export type Tags = Awaited<ReturnType<typeof serviceTags>>;
