// Postgres schema (Neon). Binary data lives in object storage; rows keep only keys, sizes and checksums.
// Users live in Neon Auth (neon_auth schema); rows here carry the Neon Auth user id. Rows from before accounts
// existed have user_id NULL and belong to the owner (OWNER_EMAIL).
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    name: text("name").notNull(),
    mode: text("mode").notNull(), // edit | clone | convert | digital
    status: text("status").notNull().default("draft"), // draft | edited | generated
    settings: jsonb("settings").notNull().default({}), // layout, instruction, content, transcript, toggles
    cursor: integer("cursor").notNull().default(0), // current version index (0 = original)
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(), // source | reference | paper | version
    name: text("name").notNull(),
    kind: text("kind"), // sniffed InputKind once confirmed
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status").notNull().default("pending"), // pending | ready
    createdAt: ts("created_at"),
  },
  (t) => [index("source_files_project_idx").on(t.projectId)],
);

export const referenceStyles = pgTable("reference_styles", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => sourceFiles.id, {
    onDelete: "set null",
  }),
  cropBoxes: jsonb("crop_boxes").notNull().default([]), // word crops used for style (boxes only, no text)
  inkColor: text("ink_color"),
  createdAt: ts("created_at"),
});

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    index: integer("index").notNull(), // 1..n; 0 is the original source file
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    method: text("method").notNull(), // native | reconstruction | text
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("document_versions_project_index").on(t.projectId, t.index),
  ],
);

export const operations = pgTable("operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  versionId: uuid("version_id")
    .notNull()
    .references(() => documentVersions.id, { onDelete: "cascade" }),
  op: jsonb("op").notNull(), // validated plan operation
  report: jsonb("report").notNull(), // engine result: status, warnings, font
  createdAt: ts("created_at"),
});

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id"),
    kind: text("kind").notNull().default("handwriting"),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | cancelled
    payload: jsonb("payload").notNull(),
    inputs: jsonb("inputs").notNull().default({}), // name -> { key, type, sha256 }
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    workerId: text("worker_id"),
    idempotencyKey: text("idempotency_key").unique(),
    error: text("error"),
    manifest: jsonb("manifest"),
    progress: jsonb("progress"), // { stage, done, total, percent, eta } reported by the worker heartbeat
    history: jsonb("history").notNull().default([]),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("render_jobs_status_idx").on(t.status, t.createdAt),
    index("render_jobs_user_idx").on(t.userId),
  ],
);

export const outputArtifacts = pgTable(
  "output_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => renderJobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("output_artifacts_job_name").on(t.jobId, t.name)],
);

/** Liveness of the polling worker (one row per worker id). */
export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  lastSeen: ts("last_seen"),
});

/** Free-tier usage that is not a render job (AI edit plans). Jobs are counted from render_jobs. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(), // plan
    createdAt: ts("created_at"),
  },
  (t) => [index("usage_events_user_idx").on(t.userId)],
);
