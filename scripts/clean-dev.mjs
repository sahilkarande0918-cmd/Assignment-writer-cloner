// Deletes all projects/jobs (rows + stored objects) on the Neon *dev* branch left by E2E/integration runs.
// Usage: node --env-file=.env.test.local scripts/clean-dev.mjs   (refuses to run on production)
import { neon } from "@neondatabase/serverless";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

if (!process.env.NEON_BRANCH || /production|main/.test(process.env.NEON_BRANCH)) throw new Error("Refusing: not the dev branch.");
const sql = neon(process.env.DATABASE_URL);
const s3 = new S3Client({ forcePathStyle: true });
const Bucket = process.env.STORAGE_BUCKET;
let removed = 0;
for (const Prefix of ["projects/", "jobs/"]) {
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key }));
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
    removed += keys.length;
    token = page.NextContinuationToken;
  } while (token);
}
const [p] = await sql`with d as (delete from projects returning 1) select count(*)::int n from d`;
const [j] = await sql`with d as (delete from render_jobs returning 1) select count(*)::int n from d`;
await sql`delete from workers`;
console.log(`dev branch ${process.env.NEON_BRANCH}: removed ${p.n} projects, ${j.n} jobs, ${removed} objects`);
