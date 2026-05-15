import { NextResponse } from "next/server";
import { canManageWorkspace, getRequestContext } from "../../../../../lib/auth-context.js";
import { buildProviderAuthorizationUrl } from "../../../../../lib/integrations.js";

export async function GET(request, { params }) {
  try {
    const context = await getRequestContext(request);

    if (!canManageWorkspace(context)) {
      return NextResponse.json(
        { error: "You do not have permission to connect integrations." },
        { status: 403 },
      );
    }

    const { provider } = await params;
    const requestUrl = new URL(request.url);
    const workspaceId = requestUrl.searchParams.get("workspaceId") || undefined;
    const result = buildProviderAuthorizationUrl(provider, request, context, workspaceId);

    if (result.error) {
      return NextResponse.redirect(
        new URL(
          `/app?integration_error=${encodeURIComponent(result.error)}`,
          requestUrl.origin,
        ),
      );
    }

    return NextResponse.redirect(result.url);
  } catch (error) {
    const requestUrl = new URL(request.url);
    return NextResponse.redirect(
      new URL(
        `/app?integration_error=${encodeURIComponent(
          error.message || "Unable to start integration authorization.",
        )}`,
        requestUrl.origin,
      ),
    );
  }
}

export async function POST(request, { params }) {
  try {
    const context = await getRequestContext(request);

    if (!canManageWorkspace(context)) {
      return NextResponse.json(
        { error: "You do not have permission to connect integrations." },
        { status: 403 },
      );
    }

    const { provider } = await params;
    const body = await request.json().catch(() => ({}));
    const requestUrl = new URL(request.url);

    if (body.shop) {
      requestUrl.searchParams.set("shop", body.shop);
    }

    if (body.workspaceId) {
      requestUrl.searchParams.set("workspaceId", body.workspaceId);
    }

    const proxyRequest = new Request(requestUrl, {
      headers: request.headers,
      method: "GET",
    });
    const result = buildProviderAuthorizationUrl(
      provider,
      proxyRequest,
      context,
      body.workspaceId,
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Unable to start integration authorization.",
      },
      { status: 500 },
    );
  }
}
