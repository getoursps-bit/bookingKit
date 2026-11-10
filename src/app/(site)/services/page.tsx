import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/services";

// A route only. What it shows is the "site.services" view, which a client may replace in theme/views.ts.
const View = view("site.services");

export default function Route() {
  return <View />;
}
