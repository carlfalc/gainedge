
-- Fix security definer view
ALTER VIEW public.ron_platform_stats SET (security_invoker = on);
