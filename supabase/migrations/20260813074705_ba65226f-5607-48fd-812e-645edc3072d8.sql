-- Phase 2D.2a — RON Agentic Core v1 persistence foundation (ADDITIVE ONLY).
-- Service-role only: dashboard readers are NOT being flipped in this phase.

CREATE TABLE public.ron_agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  agent_version integer NOT NULL,
  authority_class text NOT NULL,
  authority_rank integer NOT NULL,
  non_authoritative boolean NOT NULL DEFAULT false,
  source_health_authoritative boolean NOT NULL DEFAULT false,
  ttl_multiplier numeric NOT NULL DEFAULT 1,
  purpose text NOT NULL,
  registry_version integer NOT NULL,
  registry_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_agent_registry_identity UNIQUE (agent_id, agent_version, registry_version)
);
GRANT SELECT, INSERT ON public.ron_agent_registry TO service_role;
ALTER TABLE public.ron_agent_registry ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ron_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  trace_id text NOT NULL,
  agent_id text NOT NULL,
  agent_version integer NOT NULL,
  schema_version integer NOT NULL,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ron_agent_runs_trace_idx ON public.ron_agent_runs (trace_id);
GRANT SELECT, INSERT ON public.ron_agent_runs TO service_role;
ALTER TABLE public.ron_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ron_agent_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_hash text NOT NULL UNIQUE,
  schema_version integer NOT NULL,
  run_id text NOT NULL REFERENCES public.ron_agent_runs (run_id),
  trace_id text NOT NULL,
  agent_id text NOT NULL,
  agent_version integer NOT NULL,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  as_of timestamptz NOT NULL,
  source_timestamps jsonb NOT NULL DEFAULT '{}'::jsonb,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_health jsonb NOT NULL,
  uncertainty jsonb NOT NULL,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  direction text,
  recommendation text NOT NULL,
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ron_agent_evidence_trace_idx ON public.ron_agent_evidence (trace_id);
GRANT SELECT, INSERT ON public.ron_agent_evidence TO service_role;
ALTER TABLE public.ron_agent_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ron_orchestrator_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id text NOT NULL UNIQUE,
  decision_hash text NOT NULL UNIQUE,
  explanation_hash text NOT NULL,
  trace_id text NOT NULL,
  orchestrator_version integer NOT NULL,
  decision_schema_version integer NOT NULL,
  evidence_schema_version integer NOT NULL,
  registry_hash text NOT NULL,
  ttl_policy_version integer NOT NULL,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  as_of timestamptz NOT NULL,
  state text NOT NULL,
  recommendation text NOT NULL,
  direction text NOT NULL,
  numeric_probability numeric,
  execution_allowed boolean NOT NULL DEFAULT false,
  execution_path text NOT NULL DEFAULT 'signal_only',
  decision jsonb NOT NULL,
  explanation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_decision_no_probability CHECK (numeric_probability IS NULL),
  CONSTRAINT ron_decision_no_execution CHECK (execution_allowed = false),
  CONSTRAINT ron_decision_signal_only CHECK (execution_path = 'signal_only')
);
CREATE INDEX ron_orchestrator_decisions_trace_idx ON public.ron_orchestrator_decisions (trace_id);
GRANT SELECT, INSERT ON public.ron_orchestrator_decisions TO service_role;
ALTER TABLE public.ron_orchestrator_decisions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ron_decision_evidence (
  decision_id text NOT NULL REFERENCES public.ron_orchestrator_decisions (decision_id) ON DELETE RESTRICT,
  evidence_hash text NOT NULL REFERENCES public.ron_agent_evidence (evidence_hash) ON DELETE RESTRICT,
  ordinal integer NOT NULL,
  authority_rank integer NOT NULL,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, evidence_hash)
);
GRANT SELECT, INSERT ON public.ron_decision_evidence TO service_role;
ALTER TABLE public.ron_decision_evidence ENABLE ROW LEVEL SECURITY;

-- Fail closed for every non-service role, and forbid mutation even for service_role.
REVOKE ALL ON public.ron_agent_registry FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ron_agent_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ron_agent_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ron_orchestrator_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ron_decision_evidence FROM PUBLIC, anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE ON public.ron_agent_registry FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.ron_agent_runs FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.ron_agent_evidence FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.ron_orchestrator_decisions FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.ron_decision_evidence FROM service_role;