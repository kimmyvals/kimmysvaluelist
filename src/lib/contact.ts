import { supabase } from "@/integrations/supabase/client";

const DISCORD_WEBHOOK =
  "https://discord.com/api/webhooks/1507664269213437972/ZZ9rKtY3pfi0dFRdKp0LxPI4-MV5PfsY6aPVUOL1zWxW54sQ4P5r6sXFheGqboCH3Zk6";

export async function submitContactMessage(opts: {
  userId: string;
  username: string;
  subject: string;
  body: string;
}) {
  const { data, error } = await supabase
    .from("contact_messages")
    .insert({
      user_id: opts.userId,
      username: opts.username,
      subject: opts.subject,
      body: opts.body,
    })
    .select()
    .single();
  if (error) throw error;

  // Fire-and-forget Discord notification. Failure here should not break the
  // user-visible flow because the message is already saved in the inbox.
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Valuelist Inbox",
        embeds: [
          {
            title: `New message from ${opts.username}`,
            description: opts.body.slice(0, 1800),
            color: 0x5865f2,
            fields: [{ name: "Subject", value: opts.subject.slice(0, 256) }],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    /* ignore network errors */
  }

  return data;
}

/**
 * Encode an image URL so spaces / unicode in filenames don't break <img src>.
 * Safe to call on both relative paths and absolute URLs.
 */
export function encodeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    // encodeURI preserves /, :, ?, # etc. and only encodes things like spaces.
    return encodeURI(url);
  } catch {
    return url;
  }
}
