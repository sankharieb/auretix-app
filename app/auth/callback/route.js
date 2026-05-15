import { NextResponse } from "next/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") || "/app";
  const redirectUrl = new URL(next, requestUrl.origin);

  if (code) {
    redirectUrl.searchParams.set("code", code);
  }

  if (tokenHash && type) {
    redirectUrl.searchParams.set("token_hash", tokenHash);
    redirectUrl.searchParams.set("type", type);
  }

  return NextResponse.redirect(redirectUrl);
}
