import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/stats";

// A route only. What it shows is the "admin.stats" view, which a client may replace in theme/views.ts.
const View = view("admin.stats");

export default function Route(props: ViewProps<"admin.stats">) {
  return <View {...props} />;
}
