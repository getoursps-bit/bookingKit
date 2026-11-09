import type { NextRequest } from "next/server";
import { clientAddress, next } from "@/server/booking/http";
import { hit } from "@/server/repos/rateLimits";
import { CSRF_COOKIE, csrfMatches } from "@/server/security";
import { acceptSuggestion, savePetPhoto } from "../server/photos";

/** The private link's pet photo: upload one (multipart), or accept the suggestion from it. Posted to /api/ext/pets/photo. */
export async function photoAction(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };
  const token = field("token");
  const page = `/b/${encodeURIComponent(token)}`;
  if (!form || !csrfMatches(request.cookies.get(CSRF_COOKIE)?.value, field("csrf"))) {
    return next(request, `${page}?error=expired`, {}, 403);
  }
  const petId = Number(field("petId"));
  if (!Number.isInteger(petId)) return next(request, page, {}, 400);

  if (field("action") === "accept") {
    const ok = await acceptSuggestion({ token, petId, breed: field("breed"), condition: field("condition") });
    return next(request, ok ? `${page}?done=photoSaved` : page, {}, ok ? 200 : 404);
  }

  if (!(await hit(`photo:${clientAddress(request)}`, 60, 20))) return next(request, `${page}?error=RateLimited`, {}, 429);
  const file = form.get("photo");
  if (!(file instanceof File)) return next(request, `${page}?error=photoInvalid`, {}, 400);
  const result = await savePetPhoto({ token, petId, bytes: new Uint8Array(await file.arrayBuffer()), type: file.type });
  if (!result.ok) {
    const error = result.reason === "Invalid" ? "photoInvalid" : result.reason === "Off" ? "photoOff" : "NotFound";
    return next(request, `${page}?error=${error}`, {}, result.reason === "NotFound" ? 404 : 400);
  }
  return next(request, `${page}?done=photoAdded`);
}
