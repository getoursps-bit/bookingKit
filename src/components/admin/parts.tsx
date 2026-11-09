import type { ReactNode } from "react";
import { Alert } from "@/components/booking/parts";
import { isMessageKey } from "@/i18n/keys";
import { getI18n } from "@/i18n/server";

/** The `?ok=` / `?error=` notice an admin action leaves on the page it returns to. */
export async function AdminNotice({ ok, error }: { ok?: string; error?: string }) {
  const { t } = await getI18n();
  const errorKey = `admin.error.${error}`;
  if (error) return <Alert kind="error">{isMessageKey(errorKey) ? t(errorKey) : t("admin.error.invalid")}</Alert>;
  if (ok) {
    const okKey = ok.includes(".") ? ok : "admin.saved";
    return <Alert kind="ok">{isMessageKey(okKey) ? t(okKey) : t("admin.saved")}</Alert>;
  }
  return null;
}

export function Panel({ id, title, children, action }: { id: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A small admin form: CSRF token, the action name and any hidden values. */
export function ActionForm({
  action,
  csrf,
  name,
  hidden = {},
  multipart,
  children,
  className,
}: {
  action: string;
  csrf: string;
  name: string;
  hidden?: Record<string, string | number>;
  /** The form carries a file. */
  multipart?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form method="post" action={action} encType={multipart ? "multipart/form-data" : undefined} className={className}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value={name} />
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {children}
    </form>
  );
}
