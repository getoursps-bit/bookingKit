import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/home";

// A route only. What it shows is the "site.home" view, which a client may replace in theme/views.ts.
const View = view("site.home");

export default function Route() {
  return <View />;
}
