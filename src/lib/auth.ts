import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let lastUserId: string | null = null;

const hydrate = async (u: User | null) => {
  if (u?.id === lastUserId) return;

  lastUserId = u?.id ?? null;

  setUser(u);

  if (!u) {
    setIsEditor(false);
    setUsername(null);
    setLoading(false);
    return;
  }

  try {
    const [{ data: roleData }, { data: profile }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .eq("role", "editor")
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("username")
        .eq("user_id", u.id)
        .maybeSingle(),
    ]);

    setIsEditor(!!roleData);
    setUsername(profile?.username ?? null);
  } catch (err) {
    console.error("Hydrate error:", err);
  } finally {
    setLoading(false);
  }
};
      if (u?.id === lastUserId) return;

      lastUserId = u?.id ?? null;

      setUser(u);

      if (!u) {
        setIsEditor(false);
        setUsername(null);
        return;
      }

      const [{ data: roleData }, { data: profile }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", u.id)
          .eq("role", "editor")
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("username")
          .eq("user_id", u.id)
          .maybeSingle(),
      ]);

      setIsEditor(!!roleData);
      setUsername(profile?.username ?? null);
    };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
  hydrate(session?.user ?? null);
});

supabase.auth.getSession().then(async ({ data }) => {
  await hydrate(data.session?.user ?? null);
  setLoading(false);
});

return () => subscription.unsubscribe();
  }, []);

  return { user, username, isEditor, loading };
}
