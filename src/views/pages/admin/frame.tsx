import type { ReactNode } from "react";
import { brand } from "@/brand";
import { AdminFrame } from "@/views/parts/admin/AdminFrame";
import { AdminNav } from "@/views/parts/admin/AdminNav";
import { AdminServiceWorker } from "@/views/parts/admin/AdminPush";
import { Icon } from "@/views/parts/ui/Icon";
import { extensionAdminPages } from "@/extension/views";
import { getI18n } from "@/i18n/server";
import { requireStaffPage } from "@/core/platform/staff/session";

/** Every admin page needs a signed-in staff member; the login page sits outside this group. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { staff, csrf } = await requireStaffPage();
  const { t } = await getI18n();
  // An extension's own string, which the core's list of keys does not have.
  const say = t as unknown as (key: string) => string;
  return (
    <>
      <AdminFrame
        header={
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-lg font-extrabold">
                <span className="grid size-9 place-items-center rounded-full bg-brand text-brand-ink">
                  <Icon name={brand.mark} size={18} />
                </span>
                {t("admin.short")}
              </p>
              <form method="post" action="/api/admin/auth">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="action" value="logout" />
                <button type="submit" className="btn btn-secondary min-h-10 px-3 text-sm">
                  <Icon name="logout" size={16} />
                  {t("admin.logout")}
                </button>
              </form>
            </div>
            <p className="truncate text-sm text-ink-muted" dir="ltr">
              {staff.email}
            </p>
            <AdminNav extra={extensionAdminPages().map((page) => ({ href: page.href, icon: page.icon, label: say(page.label) }))} />
          </>
        }
      >
        {children}
      </AdminFrame>
      <AdminServiceWorker />
    </>
  );
}
