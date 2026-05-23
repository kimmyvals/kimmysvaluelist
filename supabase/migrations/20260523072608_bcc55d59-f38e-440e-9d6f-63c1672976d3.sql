CREATE TABLE public.skins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nickname text,
  image_url text,
  weapon_type text NOT NULL DEFAULT 'M4A1',
  season text NOT NULL DEFAULT 'Misc',
  rarity text NOT NULL DEFAULT 'Common',
  value numeric NOT NULL DEFAULT 0,
  demand numeric DEFAULT 0,
  notes text,
  kt_value numeric,
  sv_value numeric,
  kt_sv_demand numeric,
  amount_unboxed text,
  section text NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skins_weapon_name_unique UNIQUE (weapon_type, name)
);
CREATE INDEX idx_skins_rarity ON public.skins(rarity);
CREATE INDEX idx_skins_weapon ON public.skins(weapon_type);
CREATE INDEX idx_skins_season ON public.skins(season);
CREATE INDEX idx_skins_section ON public.skins(section);

CREATE TABLE public.skin_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skin_id uuid NOT NULL REFERENCES public.skins(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_skin ON public.skin_value_history(skin_id, changed_at DESC);

CREATE TYPE public.app_role AS ENUM ('editor');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.grant_first_editor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'editor') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'editor');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_grant_first_editor
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_editor();

ALTER TABLE public.skins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skin_value_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read skins" ON public.skins FOR SELECT USING (true);
CREATE POLICY "public read history" ON public.skin_value_history FOR SELECT USING (true);
CREATE POLICY "editors insert skins" ON public.skins FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'editor'));
CREATE POLICY "editors update skins" ON public.skins FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'editor'));
CREATE POLICY "editors delete skins" ON public.skins FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'editor'));
CREATE POLICY "editors insert history" ON public.skin_value_history FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'editor'));

CREATE OR REPLACE FUNCTION public.log_skin_value_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.skin_value_history(skin_id, value) VALUES (NEW.id, NEW.value);
  ELSIF (TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value) THEN
    INSERT INTO public.skin_value_history(skin_id, value) VALUES (NEW.id, NEW.value);
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_skins_value_history AFTER INSERT ON public.skins FOR EACH ROW EXECUTE FUNCTION public.log_skin_value_change();
CREATE TRIGGER trg_skins_value_history_update BEFORE UPDATE ON public.skins FOR EACH ROW EXECUTE FUNCTION public.log_skin_value_change();