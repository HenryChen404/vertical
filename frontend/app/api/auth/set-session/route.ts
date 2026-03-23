import { NextRequest, NextResponse } from "next/server";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function POST(request: NextRequest) {
  const body = await request.json();
  const token = body.token;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
