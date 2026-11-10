import { view, type ViewProps } from "@/views";

// A route only. What it shows is the "admin.frame" view, which a client may replace in theme/views.ts.
const View = view("admin.frame");

export default function Route(props: ViewProps<"admin.frame">) {
  return <View {...props} />;
}
