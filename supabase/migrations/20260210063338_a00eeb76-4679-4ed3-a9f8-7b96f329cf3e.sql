
-- 1. Mark ALL profiles as unverified
UPDATE public.profiles SET verified = false;

-- 2. Assign all 4 roles (tenant, agent, supporter, landlord) to ALL existing users
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, r.role
FROM public.profiles p
CROSS JOIN (VALUES ('tenant'::app_role), ('agent'::app_role), ('supporter'::app_role), ('landlord'::app_role)) AS r(role)
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Update the auto-assign trigger to give all 4 roles on signup
CREATE OR REPLACE FUNCTION public.auto_assign_agent_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Assign all 4 roles to new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES 
    (NEW.id, 'tenant'),
    (NEW.id, 'agent'),
    (NEW.id, 'supporter'),
    (NEW.id, 'landlord')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
