-- Community trading-room chat for the Whisky & Cigar Lounge.
CREATE TABLE IF NOT EXISTS public.lounge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lounge_messages_created_at
  ON public.lounge_messages(created_at DESC);

ALTER TABLE public.lounge_messages ENABLE ROW LEVEL SECURITY;

-- Every authenticated member can read the room.
CREATE POLICY "Authenticated can read lounge messages"
  ON public.lounge_messages FOR SELECT
  TO authenticated
  USING (true);

-- Members can only post as themselves.
CREATE POLICY "Users insert own lounge messages"
  ON public.lounge_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members can delete their own messages.
CREATE POLICY "Users delete own lounge messages"
  ON public.lounge_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.lounge_messages TO authenticated;

-- Realtime broadcast (guarded so the migration is safe to re-run).
ALTER TABLE public.lounge_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lounge_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_messages;
  END IF;
END $$;
