// Project persistence: rows in Neon, bytes in private object storage, signed URLs for every read/write.
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { MAX_FILE_BYTES, sanitizeFilename, sniffKind } from "../formats";
import { db, schema as s } from "./db";
import { copyObject, deletePrefix, headBytes, objectSize, projectPrefix, signedGet, signedPut } from "./storage";

export const MAX_PROJECTS = 50;
export const MAX_FILES_PER_PROJECT = 60;
export const MODES = ["edit", "clone", "convert", "digital"] as const;
export const SLOTS = ["source", "reference", "paper", "version"] as const;
export type Slot = (typeof SLOTS)[number];

export class Conflict extends Error {}
export class NotFound extends Error {}
export class Invalid extends Error {}

export async function listProjects(q?: string, mode?: string) {
  const where = and(q ? ilike(s.projects.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined, mode && (MODES as readonly string[]).includes(mode) ? eq(s.projects.mode, mode) : undefined);
  const rows = await db()
    .select({
      id: s.projects.id,
      name: s.projects.name,
      mode: s.projects.mode,
      status: s.projects.status,
      cursor: s.projects.cursor,
      createdAt: s.projects.createdAt,
      updatedAt: s.projects.updatedAt,
      // Correlated subqueries use explicit aliases: Drizzle omits the outer table name inside raw SQL.
      bytes: sql<number>`coalesce((select sum(sf.bytes) from source_files sf where sf.project_id = "projects"."id"), 0)::bigint`.mapWith(Number),
      versions: sql<number>`(select count(*) from document_versions dv where dv.project_id = "projects"."id")::int`.mapWith(Number),
      jobs: sql<number>`(select count(*) from render_jobs rj where rj.project_id = "projects"."id" and rj.status = 'succeeded')::int`.mapWith(Number),
    })
    .from(s.projects)
    .where(where)
    .orderBy(desc(s.projects.updatedAt));
  const [{ total }] = await db().select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(s.projects);
  return { projects: rows, total, limit: MAX_PROJECTS };
}

export async function createProject(name: string, mode: string) {
  const [{ total }] = await db().select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(s.projects);
  if (total >= MAX_PROJECTS) throw new Invalid(`The library holds up to ${MAX_PROJECTS} projects. Delete one to make room.`);
  const [p] = await db().insert(s.projects).values({ name, mode }).returning();
  return p;
}

const fileView = async (f: typeof s.sourceFiles.$inferSelect) => ({
  id: f.id,
  slot: f.slot,
  name: f.name,
  kind: f.kind,
  mime: f.mime,
  bytes: f.bytes,
  status: f.status,
  url: f.status === "ready" ? await signedGet(f.storageKey) : null,
  downloadUrl: f.status === "ready" ? await signedGet(f.storageKey, f.name) : null,
});

export async function getProject(id: string) {
  const [p] = await db().select().from(s.projects).where(eq(s.projects.id, id));
  if (!p) throw new NotFound("Project not found.");
  const files = await db().select().from(s.sourceFiles).where(and(eq(s.sourceFiles.projectId, id), eq(s.sourceFiles.status, "ready"))).orderBy(asc(s.sourceFiles.createdAt));
  const versions = await db().select().from(s.documentVersions).where(eq(s.documentVersions.projectId, id)).orderBy(asc(s.documentVersions.index));
  const ops = versions.length ? await db().select().from(s.operations).where(inArray(s.operations.versionId, versions.map((v) => v.id))) : [];
  const jobs = await db().select({ id: s.renderJobs.id, status: s.renderJobs.status, createdAt: s.renderJobs.createdAt, manifest: s.renderJobs.manifest }).from(s.renderJobs).where(eq(s.renderJobs.projectId, id)).orderBy(desc(s.renderJobs.createdAt)).limit(10);
  const views = await Promise.all(files.map(fileView));
  return {
    project: p,
    // Latest upload per slot is the active input; older ones remain as history.
    files: views.filter((f) => f.slot !== "version"),
    versions: versions.map((v) => ({
      id: v.id,
      index: v.index,
      label: v.label,
      method: v.method,
      createdAt: v.createdAt,
      file: views.find((f) => f.id === v.fileId) ?? null,
      operations: ops.filter((o) => o.versionId === v.id).map((o) => ({ op: o.op, report: o.report })),
    })),
    jobs,
  };
}

/** Optimistic locking: the client sends the updatedAt it last saw; a newer row wins and the client must reload. */
export async function updateProject(id: string, expectedUpdatedAt: string, patch: { name?: string; mode?: string; settings?: unknown; cursor?: number; status?: string }) {
  const rows = await db()
    .update(s.projects)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(s.projects.id, id), sql`date_trunc('milliseconds', ${s.projects.updatedAt}) = ${expectedUpdatedAt}::timestamptz`))
    .returning();
  if (!rows.length) {
    const [exists] = await db().select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.id, id));
    throw exists ? new Conflict("This project changed elsewhere. Reload to get the latest version.") : new NotFound("Project not found.");
  }
  return rows[0];
}

export async function deleteProject(id: string) {
  const jobIds = (await db().select({ id: s.renderJobs.id }).from(s.renderJobs).where(eq(s.renderJobs.projectId, id))).map((j) => j.id);
  const rows = await db().delete(s.projects).where(eq(s.projects.id, id)).returning({ id: s.projects.id });
  if (!rows.length) throw new NotFound("Project not found.");
  await deletePrefix(projectPrefix(id)); // rows cascade; objects removed by prefix
  for (const j of jobIds) await deletePrefix(`jobs/${j}/`);
}

export async function duplicateProject(id: string) {
  const { project } = await getProject(id);
  const copy = await createProject(`${project.name} (copy)`, project.mode);
  await db().update(s.projects).set({ settings: project.settings, cursor: project.cursor, status: project.status }).where(eq(s.projects.id, copy.id));
  const files = await db().select().from(s.sourceFiles).where(and(eq(s.sourceFiles.projectId, id), eq(s.sourceFiles.status, "ready")));
  const idMap = new Map<string, string>();
  for (const f of files) {
    const key = f.storageKey.replace(projectPrefix(id), projectPrefix(copy.id));
    await copyObject(f.storageKey, key);
    const [n] = await db().insert(s.sourceFiles).values({ ...f, id: undefined, projectId: copy.id, storageKey: key, createdAt: undefined }).returning({ id: s.sourceFiles.id });
    idMap.set(f.id, n.id);
  }
  const versions = await db().select().from(s.documentVersions).where(eq(s.documentVersions.projectId, id));
  for (const v of versions) {
    const [nv] = await db().insert(s.documentVersions).values({ projectId: copy.id, index: v.index, fileId: idMap.get(v.fileId)!, label: v.label, method: v.method }).returning({ id: s.documentVersions.id });
    const ops = await db().select().from(s.operations).where(eq(s.operations.versionId, v.id));
    if (ops.length) await db().insert(s.operations).values(ops.map((o) => ({ projectId: copy.id, versionId: nv.id, op: o.op, report: o.report })));
  }
  return copy;
}

/** Step 1 of an upload: validate metadata, create a pending row, hand back a signed PUT URL. */
export async function createUpload(projectId: string, slot: Slot, name: string, size: number, mime: string) {
  if (!SLOTS.includes(slot)) throw new Invalid("Unknown file slot.");
  if (size <= 0 || size > MAX_FILE_BYTES) throw new Invalid(`Files are limited to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) throw new Invalid("Unsupported content type.");
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int`.mapWith(Number) }).from(s.sourceFiles).where(eq(s.sourceFiles.projectId, projectId));
  if (count >= MAX_FILES_PER_PROJECT) throw new Invalid("This project has too many files. Duplicate it or delete old versions.");
  const clean = sanitizeFilename(name);
  const [f] = await db()
    .insert(s.sourceFiles)
    .values({ projectId, slot, name: clean, mime, bytes: size, storageKey: `${projectPrefix(projectId)}${slot}/${crypto.randomUUID()}-${clean}`, status: "pending" })
    .returning();
  return { fileId: f.id, uploadUrl: await signedPut(f.storageKey, mime) };
}

/** Step 2: verify the object really arrived with the declared size and a supported signature. */
export async function confirmUpload(projectId: string, fileId: string) {
  const [f] = await db().select().from(s.sourceFiles).where(and(eq(s.sourceFiles.id, fileId), eq(s.sourceFiles.projectId, projectId)));
  if (!f) throw new NotFound("Upload not found.");
  const size = await objectSize(f.storageKey);
  if (size === null) throw new Invalid("The file did not arrive in storage.");
  const kind = sniffKind(await headBytes(f.storageKey), f.name);
  if (size !== f.bytes || !kind) {
    await db().delete(s.sourceFiles).where(eq(s.sourceFiles.id, f.id));
    await deletePrefix(f.storageKey);
    throw new Invalid(!kind ? "The stored file is not a supported document type." : "The stored file size does not match the upload.");
  }
  await db().update(s.sourceFiles).set({ status: "ready", kind }).where(eq(s.sourceFiles.id, f.id));
  const [p] = await db().update(s.projects).set({ updatedAt: sql`now()` }).where(eq(s.projects.id, projectId)).returning({ updatedAt: s.projects.updatedAt });
  return { ...(await fileView({ ...f, status: "ready", kind })), projectUpdatedAt: p.updatedAt };
}

/** Record an applied edit as an immutable version (its file was uploaded with slot "version"). Truncates any redo branch. */
export async function addVersion(projectId: string, fileId: string, index: number, label: string, method: string, ops: { op: unknown; report: unknown }[]) {
  const [f] = await db().select().from(s.sourceFiles).where(and(eq(s.sourceFiles.id, fileId), eq(s.sourceFiles.projectId, projectId), eq(s.sourceFiles.status, "ready")));
  if (!f || f.slot !== "version") throw new Invalid("Upload the version file first.");
  const stale = await db().select({ id: s.documentVersions.id, fileId: s.documentVersions.fileId }).from(s.documentVersions).where(and(eq(s.documentVersions.projectId, projectId), sql`${s.documentVersions.index} >= ${index}`));
  if (stale.length) {
    await db().delete(s.documentVersions).where(inArray(s.documentVersions.id, stale.map((v) => v.id)));
    const gone = await db().delete(s.sourceFiles).where(inArray(s.sourceFiles.id, stale.map((v) => v.fileId))).returning({ key: s.sourceFiles.storageKey });
    for (const g of gone) await deletePrefix(g.key);
  }
  const [v] = await db().insert(s.documentVersions).values({ projectId, index, fileId, label: label.slice(0, 300), method }).returning();
  if (ops.length) await db().insert(s.operations).values(ops.map((o) => ({ projectId, versionId: v.id, op: o.op, report: o.report })));
  const [p] = await db().update(s.projects).set({ cursor: index, status: "edited", updatedAt: sql`now()` }).where(eq(s.projects.id, projectId)).returning({ updatedAt: s.projects.updatedAt });
  return { ...v, projectUpdatedAt: p.updatedAt };
}
