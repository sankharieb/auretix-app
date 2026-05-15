import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const dataDirectory = path.join(process.cwd(), "data");
const leadsFile = path.join(dataDirectory, "support-requests.json");

async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(leadsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(leadsFile, "[]", "utf8");
      return;
    }

    throw error;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const lead = {
      id: `lead_${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: String(body.name || "").trim(),
      email: String(body.email || "").trim(),
      company: String(body.company || "").trim(),
      supportNeed: String(body.supportNeed || "").trim(),
      problem: String(body.problem || "").trim(),
      channel: String(body.channel || "").trim(),
      engineSummary: String(body.engineSummary || "").trim(),
      recommendedTier: body.recommendedTier ? String(body.recommendedTier).trim() : null,
    };

    if (!lead.name || !lead.email || !lead.problem || !lead.supportNeed) {
      return NextResponse.json(
        { error: "Name, email, support tier, and problem are required." },
        { status: 400 },
      );
    }

    if (!isValidEmail(lead.email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    await ensureStore();

    const raw = await readFile(leadsFile, "utf8");
    const leads = JSON.parse(raw);
    leads.unshift(lead);
    await writeFile(leadsFile, JSON.stringify(leads, null, 2), "utf8");

    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to save the support request right now.",
        detail: error.message,
      },
      { status: 500 },
    );
  }
}
