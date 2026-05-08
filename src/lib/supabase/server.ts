import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. Reads/writes the session cookies via Next.js's `cookies()`
// helper so SSR fetches see the same authenticated session the browser
// client established. Created fresh per request — never cache across
// requests, which would cross-contaminate sessions.

export async function supabaseServer() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the server runtime.",
    );
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Setting cookies during a Server Component render isn't allowed by
        // Next.js — only middleware and route handlers can. The setter
        // here is best-effort; if it throws (during RSC), we swallow it
        // and rely on middleware to refresh the session. This pattern is
        // straight from the @supabase/ssr Next.js guide.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // ignore — see comment above
        }
      },
    },
  });
}
