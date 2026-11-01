import { connection } from "next/server";
import { workerOnline } from "@/lib/server/jobs";

export async function GET() {
  await connection();
  return Response.json({ ...workerOnline(), enabled: !!process.env.WORKER_TOKEN });
}
