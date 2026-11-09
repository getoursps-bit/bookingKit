import Link from "next/link";
import { brand } from "@/brand";
import { Icon } from "@/components/ui/Icon";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t, lp } = await getI18n();
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name={brand.mark} size={32} />
      </span>
      <h1 className="text-3xl font-extrabold">{t("notFound.title")}</h1>
      <Link href={lp("/")} className="btn btn-primary">
        {t("notFound.back")}
      </Link>
    </div>
  );
}
