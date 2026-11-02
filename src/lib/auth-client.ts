"use client";
// Browser side of Neon Auth; talks to the same-origin proxy at /api/auth.
import { createAuthClient } from "@neon/auth/next";

export const authClient = createAuthClient();
