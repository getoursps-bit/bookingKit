// Imports a Dibs CSV export. Practice runs use --dry-run, which only stages,
// checks and reports. The real run imports without sending anything.
//   pnpm import:dibs <export.csv> [--dry-run] [--freeze-time=2026-11-01T06:00:00+02:00] [--map=file.json]
//   pnpm import:dibs --queue-links          after the switch: one "your new link" message per booking
//   pnpm import:dibs --export-future=out.csv  every future booking, to enter back into Dibs by hand
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasExtension } from "@/extension/registry";
import { closePool } from "@/core/platform/db";
import { applyImport, type DibsMapping, exportFutureCsv, queueImportLinks, stageImport } from "./server/dibs";
// Imported, not read from disk, so the bundled release script carries it; --map overrides it.
import defaultMapping from "./service-map.json" with { type: "json" };

function option(name: string): string | undefined {
  const arg = process.argv.find((value) => value === `--${name}` || value.startsWith(`--${name}=`));
  if (!arg) return undefined;
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
}

/** The script works only for a client whose client.json has this extension on. */
function needOn(): void {
  if (!hasExtension("dibs-import")) throw new Error('The "dibs-import" extension is not on in client.json.');
}

async function main(): Promise<void> {
  const exportTo = option("export-future");
  if (exportTo !== undefined) {
    if (!exportTo) throw new Error("Usage: --export-future=<file.csv>");
    needOn();
    await writeFile(exportTo, await exportFutureCsv());
    console.log(`Future bookings written to ${exportTo}`);
    return;
  }
  if (option("queue-links") !== undefined) {
    needOn();
    const queued = await queueImportLinks();
    console.log(`Queued ${queued} new-link messages; the worker sends them in batches of 30 every 10 minutes.`);
    return;
  }

  const file = process.argv.slice(2).find((value) => !value.startsWith("--"));
  if (!file) throw new Error("Usage: pnpm import:dibs <export.csv> [--dry-run] [--freeze-time=ISO] [--map=file.json]");
  needOn();
  const mapPath = option("map");
  const mapping = (mapPath ? JSON.parse(await readFile(mapPath, "utf8")) : defaultMapping) as DibsMapping;
  const freezeRaw = option("freeze-time");
  const freezeTime = freezeRaw ? new Date(freezeRaw) : new Date();
  if (Number.isNaN(freezeTime.getTime())) throw new Error("--freeze-time must be a date and time, e.g. 2026-11-01T06:00:00+02:00");
  const dryRun = option("dry-run") !== undefined;

  const { runId, report } = await stageImport(
    { text: await readFile(file, "utf8"), fileName: path.basename(file), mapping, dryRun, freezeTime },
  );
  const final = dryRun ? report : await applyImport(runId);
  // Counts and row numbers only: no names or phone numbers in the output.
  console.log(
    JSON.stringify(
      {
        run: runId,
        dryRun,
        ...final,
        badPhones: final.badPhones.map((entry) => entry.row),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
