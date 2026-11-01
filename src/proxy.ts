// Optimistic gate for owner-only pages. API routes still check the session themselves (requireOwner).
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/server/auth";

export async function proxy(req: NextRequest) {
  if (await isOwner(req)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/studio/:path*", "/library/:path*"] };
