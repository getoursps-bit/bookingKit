import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/offline";

// A route only. What it shows is the "site.offline" view, which a client may replace in theme/views.ts.
const View = view("site.offline");

export default function Route() {
  return <View />;
}
