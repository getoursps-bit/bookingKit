import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/accessibility";

// A route only. What it shows is the "site.accessibility" view, which a client may replace in theme/views.ts.
const View = view("site.accessibility");

export default function Route() {
  return <View />;
}
