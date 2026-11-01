"use client";
import { useEffect, useState } from "react";
import { loadDocument, type Loaded } from "@/lib/doc/load";
import type { Upload } from "./upload-card";

export type DocState =
  | { status: "empty" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; loaded: Loaded; versionId: string };

/** Loads an upload into a document model + previews; the upload itself stays immutable. */
export function useDocument(upload: Upload | undefined, ocr = true): DocState {
  const [state, setState] = useState<DocState>({ status: "empty" });
  const [prev, setPrev] = useState<Upload | undefined>();
  // Reset during render when the upload changes (React's recommended pattern over an effect).
  if (prev !== upload) {
    setPrev(upload);
    setState(upload ? { status: "loading", message: "Opening file" } : { status: "empty" });
  }

  useEffect(() => {
    if (!upload) return;
    let live = true;
    let result: Loaded | undefined;
    loadDocument(upload.file, upload.kind, (message) => live && setState({ status: "loading", message }), ocr)
      .then((loaded) => {
        result = loaded;
        if (live) setState({ status: "ready", loaded, versionId: crypto.randomUUID() });
      })
      .catch((e: Error) => live && setState({ status: "error", message: e.message }));
    return () => {
      live = false;
      // Object URLs of the upload itself belong to the upload card; only free rendered previews.
      result?.previews.forEach((p) => p.url !== upload.url && URL.revokeObjectURL(p.url));
    };
  }, [upload, ocr]);

  return state;
}
