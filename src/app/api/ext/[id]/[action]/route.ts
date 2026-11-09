import type { NextRequest } from "next/server";
import { extensionViews } from "@/extension/views";

export const dynamic = "force-dynamic";

/**
 * A form an extension's view posts: /api/ext/<extension id>/<action>. The
 * extension's handler checks the form itself (the token, the rate limit),
 * as a core route does. Unknown ids and actions are not found.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const actions = extensionViews().find((views) => views.id === id)?.actions;
  const handler = actions && Object.hasOwn(actions, action) ? actions[action] : undefined;
  if (!handler) return new Response(null, { status: 404 });
  return handler(request);
}
