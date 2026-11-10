import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/site/book";
export const dynamic = "force-dynamic";

// A route only. What it shows is the "site.book" view, which a client may replace in theme/views.ts.
const View = view("site.book");

export default function Route(props: ViewProps<"site.book">) {
  return <View {...props} />;
}
