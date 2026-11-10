import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/login";

// A route only. What it shows is the "admin.login" view, which a client may replace in theme/views.ts.
const View = view("admin.login");

export default function Route(props: ViewProps<"admin.login">) {
  return <View {...props} />;
}
