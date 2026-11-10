"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

/**
 * A modal built on the native <dialog> element, which traps focus, closes on
 * Escape and returns focus to the opener. Use only where a modal is required;
 * prefer inline content otherwise.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-xl bg-surface p-6 backdrop:bg-ink/40"
    >
      <h2 id="dialog-title" className="mb-4 text-xl font-bold">
        {title}
      </h2>
      {children}
      <button type="button" onClick={onClose} className="mt-6 min-h-11 underline">
        {t("dialog.close")}
      </button>
    </dialog>
  );
}
