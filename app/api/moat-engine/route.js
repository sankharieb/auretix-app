import { NextResponse } from "next/server";
import {
  canReadWorkspace,
  canRunDecisions,
  getRequestContext,
} from "../../../lib/auth-context.js";
import {
  createMoatDecisionAction,
  getMoatEngineBundle,
  recordMoatDecisionOutcome,
} from "../../../lib/moat-engine-store.js";

export async function GET(request) {
  try {
    const context = await getRequestContext(request);
    if (!canReadWorkspace(context)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || "workspace_demo";
    const bundle = await getMoatEngineBundle(workspaceId, context);

    return NextResponse.json({
      ...bundle,
      auth: {
        mode: context.mode,
        user: context.user,
        company: context.company,
        role: context.role,
        permissions: context.permissions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load the Auretix moat engine.",
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
        { error: "You do not have permission to record Auretix decisions." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const decision = await createMoatDecisionAction(body, context);

    return NextResponse.json({ ok: true, decision }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to record the Auretix decision.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const context = await getRequestContext(request);
    if (!canRunDecisions(context)) {
      return NextResponse.json(
        { error: "You do not have permission to record decision outcomes." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const outcome = await recordMoatDecisionOutcome(body, context);

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to record the decision outcome.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
