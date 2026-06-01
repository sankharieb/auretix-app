import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server.js";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") || "/app";

  const supabase = await createSupabaseServerClient();

  if (supabase) {
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }

    if (tokenHash && type) {
      await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}