import { NextResponse } from "next/server";
import { canReadWorkspace, getRequestContext } from "../../../../lib/auth-context.js";
import { getIntegrationStatuses } from "../../../../lib/integrations.js";
import { buildRoiSnapshot } from "../../../../lib/roi.js";
import { getWorkspaceBundle } from "../../../../lib/workspace-store.js";

export async function GET(request) {
  try {
    const context = await getRequestContext(request);

    if (!canReadWorkspace(context)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || undefined;
    const bundle = await getWorkspaceBundle(workspaceId, context);
    const integrations = getIntegrationStatuses(bundle.workspace);
    const roi = buildRoiSnapshot(bundle.workspace, bundle.decisionRuns, integrations);

    return NextResponse.json({
      workspaceId: bundle.workspace.id,
      integrations,
      roi,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load integration status.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
