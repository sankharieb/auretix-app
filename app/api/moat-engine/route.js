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
import {
  approveModelGuidanceRule,
  proposeModelGuidanceRule,
  rejectModelGuidanceRule,
} from "../../../lib/moat-model-guidance-store.js";

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

    if (body.action === "propose_guidance_rule") {
      const result = await proposeModelGuidanceRule(body, context);

      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (body.action === "approve_guidance_rule") {
      const result = await approveModelGuidanceRule(body, context);

      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "reject_guidance_rule") {
      const result = await rejectModelGuidanceRule(body, context);

      return NextResponse.json({ ok: true, ...result });
    }

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
