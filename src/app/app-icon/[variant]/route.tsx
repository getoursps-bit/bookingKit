import { ImageResponse } from "next/og";
import { brand, theme } from "@/brand";
import { ICON_PATHS } from "@/components/ui/Icon";

// App icons drawn at build time from the brand mark, so there are no image
// files to keep in sync. "maskable-512" keeps the mark inside the safe zone
// that Android crops to a circle or squircle.
const VARIANTS: Record<string, { size: number; mark: number; rounded: boolean }> = {
  "96": { size: 96, mark: 0.62, rounded: true },
  "180": { size: 180, mark: 0.6, rounded: false },
  "192": { size: 192, mark: 0.62, rounded: true },
  "512": { size: 512, mark: 0.62, rounded: true },
  "maskable-512": { size: 512, mark: 0.5, rounded: false },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const spec = VARIANTS[variant];
  if (!spec) return new Response(null, { status: 404 });
  const mark = Math.round(spec.size * spec.mark);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${theme.appIcon.from} 0%, ${theme.appIcon.to} 100%)`,
        borderRadius: spec.rounded ? spec.size * 0.22 : 0,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill={theme.appIcon.mark}>
        <path d={ICON_PATHS[brand.mark]} />
      </svg>
    </div>,
    { width: spec.size, height: spec.size },
  );
}
