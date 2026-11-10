import type { ReactNode } from "react";
import { Icon, type IconName } from "@/views/parts/ui/Icon";

/** The title band at the top of each inner page. */
export function PageHeader({ title, intro, icon }: { title: string; intro?: ReactNode; icon?: IconName }) {
  return (
    <div className="mb-6 flex items-start gap-4 md:mb-8">
      {icon ? (
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand md:size-14">
          <Icon name={icon} size={26} />
        </span>
      ) : null}
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {intro ? <p className="mt-2 max-w-prose text-ink-muted md:text-lg">{intro}</p> : null}
      </div>
    </div>
  );
}
