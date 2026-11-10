import { view, type ViewProps } from "@/views";

export { generateMetadata } from "@/views/pages/admin/extension";

export const dynamic = "force-dynamic";

// A route only. What it shows is the "admin.extension" view: a screen an extension brings to the owner area.
const View = view("admin.extension");

export default function Route(props: ViewProps<"admin.extension">) {
  return <View {...props} />;
}
