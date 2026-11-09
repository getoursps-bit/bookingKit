/**
 * The scalloped edge that leads into a band of another colour: pink before the
 * services band, plum before the footer. Decorative, drawn in CSS (`.cloud-edge`).
 */
export function CloudEdge({ color = "paper" }: { color?: "paper" | "night" }) {
  return <div aria-hidden="true" className={`cloud-edge full-bleed ${color === "night" ? "cloud-night" : ""}`} />;
}
