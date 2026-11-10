import { view } from "@/views";

export { generateMetadata } from "@/views/pages/site/products";

// A route only. What it shows is the "site.products" view, which a client may replace in theme/views.ts.
const View = view("site.products");

export default function Route() {
  return <View />;
}
