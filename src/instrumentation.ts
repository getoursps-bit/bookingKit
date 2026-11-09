// Next.js calls register() once when the server starts. The Node-only part
// sits in its own file so the edge build never sees process signals.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
