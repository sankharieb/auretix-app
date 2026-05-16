import { NextResponse } from "next/server";
import {
  canManageWorkspace,
  canReadWorkspace,
  getRequestContext,
} from "../../../lib/auth-context.js";
import {
  createPartnerMatchRequest,
  getPartnerNetworkBundle,
  updatePartnerMatchRequest,
} from "../../../lib/partner-network-store.js";

export async function GET(request) {
  try {
    const context = await getRequestContext(request);
    if (!canReadWorkspace(context)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || "workspace_demo";
    const bundle = await getPartnerNetworkBundle(workspaceId, context);

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
        error: "Unable to load the Auretix partner network.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const context = await getRequestContext(request);
    if (!canManageWorkspace(context)) {
      return NextResponse.json(
        { error: "You do not have permission to create partner match requests." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const partnerRequest = await createPartnerMatchRequest(body, context);

    return NextResponse.json({ ok: true, partnerRequest }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to create the partner match request.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const context = await getRequestContext(request);
    if (!canManageWorkspace(context)) {
      return NextResponse.json(
        { error: "You do not have permission to update partner match requests." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const partnerRequest = await updatePartnerMatchRequest(body, context);

    return NextResponse.json({ ok: true, partnerRequest });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to update the partner match request.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
