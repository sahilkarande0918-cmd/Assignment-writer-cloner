import { z } from "zod";
import { safeError, transcribeImage } from "@/lib/server/groq";
import { guard } from "@/lib/server/guard";
import { requireUser } from "@/lib/server/auth";

// Vercel caps request bodies at ~4.5 MB; the client downsizes crops to fit.
const Body = z.object({
  consent: z.literal(true),
  image: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const blocked = guard(req, 4_200_000);
  if (blocked) return blocked;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send one JPEG/PNG/WEBP image with explicit consent." }, { status: 400 });
  try {
    return Response.json({ text: await transcribeImage(body.data.image) });
  } catch (e) {
    const { status, message } = safeError(e);
    return Response.json({ error: message }, { status });
  }
}
