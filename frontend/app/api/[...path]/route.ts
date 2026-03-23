import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const url = `${BACKEND_URL}${pathname}${search}`;

  const headers = new Headers();

  // Forward essential headers
  for (const key of ["content-type", "accept", "sec-fetch-mode"]) {
    const val = request.headers.get(key);
    if (val) headers.set(key, val);
  }

  // Forward session cookie
  const session = request.cookies.get("session")?.value;
  if (session) headers.set("cookie", `session=${session}`);

  const res = await fetch(url, {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined,
  });

  // Build response headers
  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!["transfer-encoding", "content-encoding", "connection"].includes(lower)) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
