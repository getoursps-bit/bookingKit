import overrides from "../../theme/views";
import { KIT_VIEWS } from "./kit";

// The view layer: every page and owner-area screen is a named view. A view
// reads the core through its functions, posts to its actions, and has slots
// that the extensions fill (src/extension/views.ts). The route files in
// src/app only pick a view by name, here.

export type Views = typeof KIT_VIEWS;
export type ViewName = keyof Views;
/** What the route hands a view: the address parameters, as Next gives them. */
export type ViewProps<Name extends ViewName> = Parameters<Views[Name]>[0];
/** A client's own views, by the name of the kit's view each one replaces. It takes the same props. */
export type ViewOverrides = { [Name in ViewName]?: Views[Name] };

/** The view to show: the client's own when theme/views.ts lists one, the kit's otherwise. */
export function view<Name extends ViewName>(name: Name): Views[Name] {
  return ((overrides as ViewOverrides)[name] ?? KIT_VIEWS[name]) as Views[Name];
}
