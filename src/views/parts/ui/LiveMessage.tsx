/**
 * A polite live region: screen readers announce its text when it changes.
 * Used for status messages such as "code sent" instead of pop-up toasts.
 */
export function LiveMessage({ message, tone = "info" }: { message?: string; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={tone === "error" ? "text-danger" : "text-ink"}
    >
      {message}
    </p>
  );
}
