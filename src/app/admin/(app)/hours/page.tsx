import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/hours";

// A route only. What it shows is the "admin.hours" view, which a client may replace in theme/views.ts.
const View = view("admin.hours");

export default function Route(props: ViewProps<"admin.hours">) {
  return <View {...props} />;
}
