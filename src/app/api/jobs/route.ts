import { HwPayloadSchema, MAX_JOB_INPUT_BYTES } from "@/lib/hwjob";
import { createJob, publicJob, workerOnline } from "@/lib/server/jobs";
import { guard } from "@/lib/server/guard";
import { readHead, sniffKind } from "@/lib/formats";

// Queue a handwriting job. Body: multipart form with `payload` (JSON), `reference` (PNG/JPEG), optional `paper`.
export async function POST(req: Request) {
  const blocked = guard(req, MAX_JOB_INPUT_BYTES + 100_000);
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Send a multipart form." }, { status: 400 });
  const payload = HwPayloadSchema.safeParse(JSON.parse(String(form.get("payload") ?? "null")));
  if (!payload.success) return Response.json({ error: "Invalid job settings." }, { status: 400 });

  const inputs: Record<string, { data: Uint8Array; type: string }> = {};
  for (const name of ["reference", "paper"] as const) {
    const f = form.get(name);
    if (!(f instanceof File)) continue;
    const kind = sniffKind(await readHead(f), f.name);
    if (kind !== "png" && kind !== "jpeg") return Response.json({ error: `${name} must be a PNG or JPEG page image.` }, { status: 400 });
    inputs[name] = { data: new Uint8Array(await f.arrayBuffer()), type: f.type };
  }
  if (!inputs.reference) return Response.json({ error: "A handwriting reference page is required." }, { status: 400 });

  const job = createJob(payload.data, inputs, req.headers.get("idempotency-key") ?? undefined);
  return Response.json({ job: publicJob(job), worker: workerOnline() }, { status: 202 });
}
