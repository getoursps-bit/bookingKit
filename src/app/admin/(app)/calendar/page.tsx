import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/calendar";

// A route only. What it shows is the "admin.calendar" view, which a client may replace in theme/views.ts.
const View = view("admin.calendar");

export default function Route(props: ViewProps<"admin.calendar">) {
  return <View {...props} />;
}
