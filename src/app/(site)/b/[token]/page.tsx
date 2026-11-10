import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/site/manage";
export const dynamic = "force-dynamic";

// A route only. What it shows is the "site.manage" view, which a client may replace in theme/views.ts.
const View = view("site.manage");

export default function Route(props: ViewProps<"site.manage">) {
  return <View {...props} />;
}
