// Private Neon Object Storage (S3-compatible). Credentials, endpoint and region come from the AWS_* env vars.
import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({ forcePathStyle: true })); // Neon requires path-style addressing
const Bucket = () => {
  const b = process.env.STORAGE_BUCKET;
  if (!b) throw new Error("STORAGE_BUCKET is not configured.");
  return b;
};

export const URL_TTL = 600; // seconds; short-lived signed URLs only

export async function putObject(Key: string, Body: Uint8Array, ContentType: string) {
  await client().send(new PutObjectCommand({ Bucket: Bucket(), Key, Body, ContentType }));
}

export async function getObject(Key: string) {
  const r = await client().send(new GetObjectCommand({ Bucket: Bucket(), Key }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

/** First bytes of an object, for signature (magic byte) checks after a direct browser upload. */
export async function headBytes(Key: string, n = 16) {
  const r = await client().send(new GetObjectCommand({ Bucket: Bucket(), Key, Range: `bytes=0-${n - 1}` }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

export async function objectSize(Key: string) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: Bucket(), Key }));
    return r.ContentLength ?? 0;
  } catch {
    return null;
  }
}

export const signedGet = (Key: string, filename?: string) =>
  getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: Bucket(), Key, ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\]/g, "")}"` } : {}) }),
    { expiresIn: URL_TTL },
  );

/** Browser uploads straight to storage; the content type is part of the signature. */
export const signedPut = (Key: string, ContentType: string) => getSignedUrl(client(), new PutObjectCommand({ Bucket: Bucket(), Key, ContentType }), { expiresIn: URL_TTL });

export async function copyObject(from: string, to: string) {
  await client().send(new CopyObjectCommand({ Bucket: Bucket(), Key: to, CopySource: `${Bucket()}/${encodeURI(from)}` }));
}

/** Delete everything under a prefix (a project's or a job's folder). */
export async function deletePrefix(Prefix: string) {
  let token: string | undefined;
  do {
    const page = await client().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await client().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: keys } }));
    token = page.NextContinuationToken;
  } while (token);
}

export const projectPrefix = (projectId: string) => `projects/${projectId}/`;
export const jobPrefix = (jobId: string) => `jobs/${jobId}/`;
