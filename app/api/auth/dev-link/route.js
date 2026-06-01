import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/server.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required for dev login links." },
        { status: 500 },
      );
    }

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/callback?next=/app`;

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
      },
    });

    if (error) {
      throw error;
    }

    const tokenHash = data?.properties?.hashed_token;

    const actionLink = tokenHash
      ? `${origin}/auth/callback?token_hash=${encodeURIComponent(
          tokenHash,
        )}&type=magiclink&next=/app`
      : data?.properties?.action_link;

    if (!actionLink) {
      return NextResponse.json(
        { error: "Supabase did not return a development login link." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      actionLink,
      email,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Unable to generate development login link.",
      },
      { status: 500 },
    );
  }
}