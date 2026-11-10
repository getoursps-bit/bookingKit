import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/gallery";

// A route only. What it shows is the "site.gallery" view, which a client may replace in theme/views.ts.
const View = view("site.gallery");

export default function Route() {
  return <View />;
}
