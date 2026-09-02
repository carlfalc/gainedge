CREATE OR REPLACE FUNCTION public.grant_preapproved_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) IN ('falconercarlandrew@gmail.com', 'askteamonline@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_preapproved_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_preapproved_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_preapproved_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE lower(email) IN ('falconercarlandrew@gmail.com', 'askteamonline@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;