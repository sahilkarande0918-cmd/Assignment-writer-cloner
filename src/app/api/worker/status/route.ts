import { cloudGpu } from "@/lib/server/gpu";
import { workerOnline } from "@/lib/server/jobs";
import { userRoute } from "@/lib/server/http";

export const GET = userRoute(async () => Response.json({ ...(await workerOnline()), enabled: !!process.env.WORKER_TOKEN, cloud: cloudGpu() }));
