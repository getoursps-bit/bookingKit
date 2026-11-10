import { view, type ViewProps } from "@/views";

// Every public page reads the owner's content at request time, and the
// per-request script nonce needs a dynamic render anyway.
export const dynamic = "force-dynamic";

// A route only. What it shows is the "site.frame" view, which a client may replace in theme/views.ts.
const View = view("site.frame");

export default function Route(props: ViewProps<"site.frame">) {
  return <View {...props} />;
}
