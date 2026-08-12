GRANT SELECT ON public.ron_rebuild_jobs TO authenticated;

CREATE POLICY "ron_rebuild_jobs readable by authenticated"
  ON public.ron_rebuild_jobs FOR SELECT
  TO authenticated
  USING (true);