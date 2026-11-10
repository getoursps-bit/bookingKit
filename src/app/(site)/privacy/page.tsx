import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/privacy";

// A route only. What it shows is the "site.privacy" view, which a client may replace in theme/views.ts.
const View = view("site.privacy");

export default function Route() {
  return <View />;
}
