import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/settings";

// A route only. What it shows is the "admin.settings" view, which a client may replace in theme/views.ts.
const View = view("admin.settings");

export default function Route(props: ViewProps<"admin.settings">) {
  return <View {...props} />;
}
