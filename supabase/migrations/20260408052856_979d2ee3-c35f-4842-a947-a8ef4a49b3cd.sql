ALTER TABLE public.scan_results
ADD COLUMN IF NOT EXISTS volume numeric DEFAULT NULL;