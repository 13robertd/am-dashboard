"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads the public env vars at module load
// (Next.js inlines `NEXT_PUBLIC_*` into the client bundle), creates a
// singleton, and reuses it across renders so we don't open a new realtime
// connection per component mount.
//
// Session is stored in cookies by @supabase/ssr (not localStorage), so the
// server client in `./server.ts` can read the same session from RSCs and
// route handlers without any extra plumbing.

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Fail loud at first use — easier to diagnose than a silent 401.
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Did you copy .env.local.example to .env.local and fill it in?",
    );
  }
  browserClient = createBrowserClient(url, key);
  return browserClient;
}
