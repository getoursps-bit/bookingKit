import { ImageResponse } from "next/og";

// App icons drawn at build time from the paw mark, so there are no image
// files to keep in sync. "maskable-512" keeps the mark inside the safe zone
// that Android crops to a circle or squircle.
const PAW =
  "M12 13c-3 0-5.5 2.6-5.5 5 0 1.4 1.1 2.5 2.5 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.4 0 2.5-1.1 2.5-2.5 0-2.4-2.5-5-5.5-5ZM6 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z";

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
        background: "linear-gradient(135deg, #8d3a6c 0%, #5e2147 100%)",
        borderRadius: spec.rounded ? spec.size * 0.22 : 0,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="#fdeee2">
        <path d={PAW} />
      </svg>
    </div>,
    { width: spec.size, height: spec.size },
  );
}
