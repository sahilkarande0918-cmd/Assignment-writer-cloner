import { workerOnline } from "@/lib/server/jobs";
import { ownerRoute } from "@/lib/server/http";

export const GET = ownerRoute(async () => Response.json({ ...(await workerOnline()), enabled: !!process.env.WORKER_TOKEN }));
