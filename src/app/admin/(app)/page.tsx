import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/today";

// A route only. What it shows is the "admin.today" view, which a client may replace in theme/views.ts.
const View = view("admin.today");

export default function Route(props: ViewProps<"admin.today">) {
  return <View {...props} />;
}
