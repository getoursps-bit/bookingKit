import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/catalog";

// A route only. What it shows is the "admin.catalog" view, which a client may replace in theme/views.ts.
const View = view("admin.catalog");

export default function Route(props: ViewProps<"admin.catalog">) {
  return <View {...props} />;
}
