export type GitConnection = {
  id: number;
  provider: string;
  base_url: string;
  label: string;
  created_at: string;
};

export type ReportProfile = {
  id: number;
  name: string;
  git_connection_id: number;
  repo_full_names: string;
  window_days: number;
  filters: Record<string, unknown>;
  style: Record<string, unknown>;
  created_at: string;
  schedule_cron: string | null;
  schedule_enabled: boolean;
  schedule_timezone: string;
  include_prs: boolean;
  hook_public_token: string;
  llm_generate: boolean;
};

export type ReportRun = {
  id: number;
  profile_id: number;
  status: string;
  result_markdown: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  trigger_source: string;
  profile_snapshot?: Record<string, unknown>;
};

export type TemplatePreset = {
  id: string;
  label_zh: string;
  label_en: string;
  description_zh: string;
};

export type TonePreset = {
  id: string;
  label: string;
  description: string;
};

export type Organization = {
  id: number;
  name: string;
  slug: string;
  role: string;
};
