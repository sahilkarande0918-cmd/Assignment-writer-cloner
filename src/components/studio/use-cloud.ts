"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CloudError, addVersion, createProject, getProject, patchProject, uploadFile, type CloudProject } from "@/lib/cloud";

export type SaveState = "local" | "loading" | "saving" | "saved" | "error" | "conflict" | "unavailable";

/** Project persistence for the studio. All writes run through one queue so this tab never conflicts with itself;
 *  another tab's newer write surfaces as "conflict" (optimistic locking on updatedAt). */
export function useCloudProject() {
  const params = useSearchParams();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(params.get("project"));
  const [state, setState] = useState<SaveState>(params.get("project") ? "loading" : "local");
  const [error, setError] = useState<string>();
  const updatedAt = useRef<string>("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const idRef = useRef(projectId);

  const run = useCallback(<T,>(fn: () => Promise<T>) => {
    const next = queue.current.then(fn, fn);
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const fail = (e: unknown) => {
    const status = e instanceof CloudError ? e.status : 0;
    setState(status === 409 ? "conflict" : status === 503 ? "unavailable" : "error");
    setError((e as Error).message);
  };

  const load = useCallback(async (): Promise<CloudProject | null> => {
    if (!idRef.current) return null;
    try {
      const p = await getProject(idRef.current);
      updatedAt.current = String(p.project.updatedAt);
      setState("saved");
      return p;
    } catch (e) {
      fail(e);
      return null;
    }
  }, []);

  /** Create the project on first meaningful action, and put its id in the URL so a reload reopens it.
   *  Un-queued: callers already inside the queue use it directly. */
  const create = useCallback(
    async (name: string, mode: string) => {
      if (idRef.current) return idRef.current;
      const { project } = await createProject(name || "Untitled assignment", mode);
      idRef.current = project.id;
      updatedAt.current = String(project.updatedAt);
      setProjectId(project.id);
      router.replace(`/studio?project=${project.id}`, { scroll: false });
      return project.id;
    },
    [router],
  );
  const ensure = useCallback((name: string, mode: string) => run(() => create(name, mode).catch((e) => (fail(e), null))), [create, run]);

  const save = useCallback(
    (patch: Record<string, unknown>) =>
      run(async () => {
        if (!idRef.current) return;
        setState("saving");
        try {
          const { project } = await patchProject(idRef.current, updatedAt.current, patch);
          updatedAt.current = String(project.updatedAt);
          setState("saved");
        } catch (e) {
          fail(e);
        }
      }),
    [run],
  );

  const upload = useCallback(
    (name: string, mode: string, slot: "source" | "reference" | "paper" | "version", file: File) =>
      run(async () => {
        try {
          const id = await create(name, mode);
          setState("saving");
          const f = await uploadFile(id, slot, file);
          updatedAt.current = String(f.projectUpdatedAt);
          setState("saved");
          return f;
        } catch (e) {
          fail(e);
          return null;
        }
      }),
    [create, run],
  );

  const saveVersion = useCallback(
    (file: File, index: number, label: string, method: string, operations: { op: unknown; report: unknown }[]) =>
      run(async () => {
        if (!idRef.current) return;
        try {
          setState("saving");
          const f = await uploadFile(idRef.current, "version", file);
          const { version } = await addVersion(idRef.current, { fileId: f.id, index, label: label.slice(0, 300) || "Edit", method, operations });
          updatedAt.current = String(version.projectUpdatedAt);
          setState("saved");
        } catch (e) {
          fail(e);
        }
      }),
    [run],
  );

  return { projectId, state, error, load, ensure, save, upload, saveVersion };
}
