import { getI18n } from "@/i18n/server";
import { NavLinks } from "./NavLinks";

/** Phone-only app bar, fixed to the bottom and clear of the home indicator. */
export async function BottomBar() {
  const { t } = await getI18n();
  return (
    <nav
      aria-label={t("nav.app")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <NavLinks variant="bottom" />
    </nav>
  );
}
