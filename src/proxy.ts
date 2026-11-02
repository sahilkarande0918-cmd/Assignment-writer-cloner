// Gate for signed-in pages (Neon Auth middleware also refreshes the session cookie). API routes check the session themselves.
import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured } from "@/lib/server/auth";

let gate: ((req: NextRequest) => Promise<NextResponse>) | undefined;

export async function proxy(req: NextRequest) {
  if (!authConfigured()) return NextResponse.redirect(new URL("/login", req.url));
  gate ??= auth().middleware({ loginUrl: "/login" });
  const res = await gate(req);
  const loc = res.headers.get("location");
  if (loc && new URL(loc, req.url).pathname === "/login") {
    const url = new URL(loc, req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    res.headers.set("location", url.toString());
  }
  return res;
}

export const config = { matcher: ["/studio/:path*", "/library/:path*"] };
