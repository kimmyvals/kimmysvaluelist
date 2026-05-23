import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrate = (u: User | null) => {
      setUser(u);
      if (!u) {
        setIsEditor(false);
        setUsername(null);
        return;
      }
      setTimeout(async () => {
        const [{ data: roleData }, { data: profile }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", u.id)
            .eq("role", "editor").maybeSingle(),
          supabase.from("profiles").select("username").eq("user_id", u.id).maybeSingle(),
        ]);
        setIsEditor(!!roleData);
        setUsername(profile?.username ?? null);
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      hydrate(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      hydrate(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, username, isEditor, loading };
}
