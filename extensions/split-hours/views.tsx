import { defineViews } from "@/extension/views";
import { getI18n } from "@/i18n/server";
import { TimeSelect } from "@/views/parts/admin/TimeSelect";

async function SecondRange({ weekday, more }: { weekday: number; more: { opens: string; closes: string }[] }) {
  // Its own strings are not in the core's list of keys.
  const t = (await getI18n()).t as unknown as (key: string) => string;
  const second = more[0];
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={`split.${weekday}`} defaultChecked={Boolean(second)} className="size-5 accent-brand" />
        {t("hours.split")}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <TimeSelect name={`opens2.${weekday}`} label={t("hours.opens2")} value={second?.opens ?? "16:00"} />
        <TimeSelect name={`closes2.${weekday}`} label={t("hours.closes2")} value={second?.closes ?? "18:00"} />
      </div>
    </>
  );
}

export default defineViews({
  id: "split-hours",
  hoursFields: (props) => <SecondRange {...props} />,
});
