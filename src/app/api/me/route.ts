import { userRoute } from "@/lib/server/http";
import { quota } from "@/lib/server/usage";

export const GET = userRoute(async (_req, _ctx, user) => Response.json({ user: { email: user.email, name: user.name, owner: user.owner }, quota: await quota(user) }));
