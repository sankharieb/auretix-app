import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server.js";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const supabase = await createSupabaseServerClient();

  await supabase?.auth.signOut();

  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
