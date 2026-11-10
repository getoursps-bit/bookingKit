"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { Alert } from "@/views/parts/ui/Alert";
import { useI18n } from "@/i18n/client";

type Progress = { done: number; total: number };

/**
 * The gallery upload form. It sends the chosen photos one at a time and shows
 * how far it got; a photo that fails is named and the others are kept. Without
 * JavaScript the same form posts them all at once.
 */
export function GalleryUploadForm({
  action,
  csrf,
  className,
  children,
}: {
  action: string;
  csrf: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    // Read before the fieldset turns off: disabled fields leave the form data.
    const shared = new FormData(form);
    const photos = shared.getAll("file").filter((value) => value instanceof File);
    shared.delete("file");
    setProblem(null);

    const failed: string[] = [];
    for (const [index, photo] of photos.entries()) {
      setProgress({ done: index + 1, total: photos.length });
      const body = new FormData();
      shared.forEach((value, key) => body.append(key, value));
      body.append("file", photo);
      const sent = await fetch(action, { method: "POST", body, headers: { accept: "application/json" } })
        .then((response) => response.ok)
        .catch(() => false);
      if (!sent) failed.push(photo.name);
    }
    setProgress(null);

    if (failed.length === 0) {
      form.reset();
      router.push("/admin/catalog?ok=saved#gallery");
      router.refresh();
      return;
    }
    setProblem(t("catalog.uploadFailed", { failed: failed.length, total: photos.length, names: failed.join(", ") }));
    const input = form.elements.namedItem("file");
    if (input instanceof HTMLInputElement) input.value = "";
    router.refresh();
  };

  return (
    <form method="post" action={action} encType="multipart/form-data" onSubmit={onSubmit}>
      <input type="hidden" name="csrf" value={csrf} />
      <fieldset disabled={progress !== null} className={className}>
        {children}
      </fieldset>
      <p role="status" className="mt-3 text-sm font-semibold empty:hidden">
        {progress ? t("catalog.uploading", { done: progress.done, total: progress.total }) : null}
      </p>
      {problem ? <Alert kind="error">{problem}</Alert> : null}
    </form>
  );
}
