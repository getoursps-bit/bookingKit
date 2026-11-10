import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/hours";

// A route only. What it shows is the "site.hours" view, which a client may replace in theme/views.ts.
const View = view("site.hours");

export default function Route() {
  return <View />;
}
