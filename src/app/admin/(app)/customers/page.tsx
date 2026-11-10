import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/customers";

// A route only. What it shows is the "admin.customers" view, which a client may replace in theme/views.ts.
const View = view("admin.customers");

export default function Route(props: ViewProps<"admin.customers">) {
  return <View {...props} />;
}
