import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ContactSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});

export const sendContactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContactSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Look up the caller's username from their profile.
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();
    const username = profile?.username ?? "unknown";

    const { data: row, error } = await supabase
      .from("contact_messages")
      .insert({
        user_id: userId,
        username,
        subject: data.subject,
        body: data.body,
      })
      .select()
      .single();
    if (error) {
      console.error("[contact] insert error:", error.message);
      throw new Error("Failed to send message. Please try again.");
    }

    // Fire-and-forget Discord notification using a server-only secret.
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "Valuelist Inbox",
            embeds: [
              {
                title: `New message from ${username}`,
                description: data.body.slice(0, 1800),
                color: 0x5865f2,
                fields: [{ name: "Subject", value: data.subject.slice(0, 256) }],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch {
        /* ignore */
      }
    }

    return { id: row.id };
  });
