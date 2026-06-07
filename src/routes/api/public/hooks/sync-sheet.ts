import { createFileRoute } from "@tanstack/react-router";
import { runSheetSync } from "@/lib/sync.functions";

// Hourly cron endpoint — called by pg_cron with the project's publishable key.
// The /api/public/* prefix bypasses platform auth; we still validate apikey to
// keep random visitors from triggering writes.
export const Route = createFileRoute("/api/public/hooks/sync-sheet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await runSheetSync({ force: false });
        return Response.json(result);
      },
    },
  },
});
