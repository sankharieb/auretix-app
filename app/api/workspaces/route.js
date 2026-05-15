import { NextResponse } from "next/server";
import {
  canManageWorkspace,
  canReadWorkspace,
  getRequestContext,
} from "../../../lib/auth-context.js";
import { getWorkspaceBundle, upsertWorkspaceSnapshot } from "../../../lib/workspace-store";

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
        error: "Unable to load the Auretix workspace.",
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
        { error: "You do not have permission to save this workspace." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const workspace = await upsertWorkspaceSnapshot(body, context);

    return NextResponse.json({ ok: true, workspace }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to save the Auretix workspace.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
