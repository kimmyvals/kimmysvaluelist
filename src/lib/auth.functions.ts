import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LoginSchema = z.object({
  identifier: z.string().min(1).max(255),
  password: z.string().min(1).max(200),
});

/**
 * Sign in with either email or username.
 * Username->email lookup happens server-side with the service role,
 * so the email is never returned to unauthenticated clients.
 */
export const loginWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoginSchema.parse(input))
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    let email = id;

    if (!id.includes("@")) {
      const { data: lookup, error: lookupErr } = await supabaseAdmin.rpc(
        "email_for_username",
        { _username: id },
      );
      if (lookupErr) throw new Error("Login failed");
      if (!lookup) throw new Error("Invalid login credentials");
      email = lookup as string;
    }

    // Use a fresh, non-persistent anon client to perform the actual sign-in.
    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: session, error } = await anon.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !session.session) throw new Error("Invalid login credentials");

    return {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    };
  });
