// Neon Auth proxy (sign-up, sign-in, email codes, sign-out, session). Created lazily so builds need no auth env.
import { auth } from "@/lib/server/auth";

type Ctx = { params: Promise<{ path: string[] }> };
const forward = (m: "GET" | "POST") => (req: Request, ctx: Ctx) => auth().handler()[m](req, ctx);

export const GET = forward("GET");
export const POST = forward("POST");
