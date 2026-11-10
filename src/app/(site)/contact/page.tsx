import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/contact";

// A route only. What it shows is the "site.contact" view, which a client may replace in theme/views.ts.
const View = view("site.contact");

export default function Route() {
  return <View />;
}
