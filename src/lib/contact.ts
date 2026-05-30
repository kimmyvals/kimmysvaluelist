import { sendContactMessage } from "./contact.functions";

export async function submitContactMessage(opts: {
  userId: string;
  username: string;
  subject: string;
  body: string;
}) {
  // userId/username args kept for call-site compatibility; the server fn
  // derives them from the authenticated session so they can't be spoofed.
  return sendContactMessage({
    data: { subject: opts.subject, body: opts.body },
  });
}

/**
 * Encode an image URL so spaces / unicode in filenames don't break <img src>.
 */
export function encodeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return encodeURI(url);
  } catch {
    return url;
  }
}
