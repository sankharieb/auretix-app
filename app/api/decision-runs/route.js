import { NextResponse } from "next/server";
import {
  canReadWorkspace,
  canRunDecisions,
  getRequestContext,
} from "../../../lib/auth-context.js";
import { createDecisionRun, getWorkspaceBundle } from "../../../lib/workspace-store";

export async function GET(request) {
  try {
    const context = await getRequestContext(request);
    if (!canReadWorkspace(context)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || "workspace_demo";
    const bundle = await getWorkspaceBundle(workspaceId, context);

    return NextResponse.json({
      workspaceId: bundle.workspace.id,
      decisionRuns: bundle.decisionRuns,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load decision runs.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const context = await getRequestContext(request);
    if (!canRunDecisions(context)) {
      return NextResponse.json(
        { error: "You do not have permission to create decision runs." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const decisionRun = await createDecisionRun(body, context);

    return NextResponse.json({ ok: true, decisionRun }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to save the decision run.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
