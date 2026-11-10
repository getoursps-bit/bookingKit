import { view } from "@/views";

// A route only. What it shows is the "site.notFound" view, which a client may replace in theme/views.ts.
const View = view("site.notFound");

export default function Route() {
  return <View />;
}
