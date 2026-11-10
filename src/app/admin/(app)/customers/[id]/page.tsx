import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/customer";

// A route only. What it shows is the "admin.customer" view, which a client may replace in theme/views.ts.
const View = view("admin.customer");

export default function Route(props: ViewProps<"admin.customer">) {
  return <View {...props} />;
}
