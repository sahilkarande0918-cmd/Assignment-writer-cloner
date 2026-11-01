import { connection } from "next/server";
import { groq, groqModels } from "@/lib/server/groq";

// Reports whether Groq is configured and which configured models the account can actually use.
export async function GET() {
  await connection();
  const models = groqModels();
  if (!process.env.GROQ_API_KEY) return Response.json({ configured: false, models });
  try {
    const list = await groq().models.list();
    const ids = new Set(list.data.map((m) => m.id));
    return Response.json({ configured: true, models, available: Object.fromEntries(Object.entries(models).map(([k, id]) => [k, ids.has(id)])) });
  } catch {
    return Response.json({ configured: true, models, error: "Could not reach Groq or the key was rejected." });
  }
}
