import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** A message box: errors are announced at once, other kinds politely. */
export function Alert({ kind, children, id }: { kind: "error" | "ok" | "info"; children: ReactNode; id?: string }) {
  return (
    <div id={id} role={kind === "error" ? "alert" : "status"} className={`alert alert-${kind}`}>
      <Icon name={kind === "error" ? "alert" : kind === "ok" ? "check" : "bell"} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
