import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/site/landing";

// A route only. What it shows is the "site.landing" view, which a client may replace in theme/views.ts.
const View = view("site.landing");

export default function Route(props: ViewProps<"site.landing">) {
  return <View {...props} />;
}
