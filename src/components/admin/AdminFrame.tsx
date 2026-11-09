"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The admin page frame: the menu in a column beside the page, except on the
 * calendar, where it becomes a row on top so the calendar gets the full width.
 */
export function AdminFrame({ header, children }: { header: ReactNode; children: ReactNode }) {
  const wide = usePathname().startsWith("/admin/calendar");
  return (
    <div
      data-frame={wide ? "wide" : "column"}
      className={`mx-auto flex w-full flex-1 flex-col gap-4 px-4 pt-4 pb-10 ${
        wide ? "admin-frame-wide max-w-[100rem] md:px-6" : "max-w-7xl md:flex-row md:gap-8 md:pt-8"
      }`}
    >
      <header
        className={`flex flex-col gap-3 ${
          wide ? "md:flex-row md:flex-wrap md:items-center md:justify-between" : "md:sticky md:top-8 md:w-56 md:shrink-0 md:self-start"
        }`}
      >
        {header}
      </header>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
