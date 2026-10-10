-- One statement per ';' + newline (scripts/migrate.ts splits on that).

create extension if not exists pgcrypto;

create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists designers (
  id serial primary key,
  name text not null,
  telegram_user_id bigint unique,
  calendly_token text,
  calendly_event_type_uri text,
  calendly_timezone text not null default 'Asia/Kolkata',
  active boolean not null default true
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text,
  name text,
  status text not null default 'needs_review',
  routing text,
  assigned_designer_id int references designers(id),
  decline_reason text,
  hubspot_contact_id text,
  hubspot_deal_id text,
  booking_id text,
  booking_time timestamptz,
  booking_status text,
  first_call_at timestamptz,
  last_call_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_phone_idx on leads(phone);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  channel text not null default 'phone',
  external_id text unique,
  from_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  answered_within_5min boolean,
  out_of_hours boolean,
  transcript text,
  consent text,
  extraction jsonb,
  ai_criteria jsonb,
  final_criteria jsonb,
  overrides jsonb not null default '[]',
  call_type text,
  confidence text,
  routing text,
  cost_voice_inr numeric(10,2),
  cost_ai_inr numeric(10,4),
  cost_total_inr numeric(10,2),
  gemini_in_tokens int,
  gemini_out_tokens int,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists calls_lead_idx on calls(lead_id);

create index if not exists calls_from_idx on calls(from_number, ended_at);

create table if not exists telegram_messages (
  id bigserial primary key,
  lead_id uuid references leads(id),
  call_id uuid references calls(id),
  kind text not null,
  chat_id bigint not null,
  message_id bigint,
  text text,
  acted boolean not null default false,
  action text,
  actor_id bigint,
  actor_name text,
  acted_at timestamptz,
  decline_prompt_message_id bigint,
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists telegram_actions (
  id bigserial primary key,
  telegram_message_id bigint references telegram_messages(id),
  lead_id uuid references leads(id),
  action text not null,
  actor_id bigint,
  actor_name text,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  designer_id int references designers(id),
  calendly_event_uri text,
  calendly_invitee_uri text unique,
  start_time timestamptz,
  status text not null default 'booked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads add column if not exists decision text not null default 'none';

alter table leads add column if not exists decided_by int references designers(id);

alter table leads add column if not exists decided_at timestamptz;

alter table leads add column if not exists decision_note text;

alter table leads add column if not exists meeting_url text;

alter table designers add column if not exists dashboard_token text;

alter table designers add column if not exists email text;

alter table designers add column if not exists scheduler text not null default 'calendly';

alter table designers add column if not exists cal_api_key text;

alter table designers add column if not exists cal_event_type_id int;

create unique index if not exists designers_dash_idx on designers(dashboard_token);

alter table bookings add column if not exists provider text not null default 'calendly';

alter table bookings add column if not exists external_id text;

alter table bookings add column if not exists meeting_url text;

alter table bookings add column if not exists created_by text not null default 'designer';

alter table bookings add column if not exists host_name text;

alter table bookings add column if not exists host_email text;

alter table bookings add column if not exists attendee jsonb;

alter table leads add column if not exists booked_by text;

create unique index if not exists bookings_provider_ext_idx on bookings(provider, external_id) where external_id is not null;

alter table calls add column if not exists urgent boolean not null default false;

alter table calls add column if not exists urgent_reason text;

alter table designers add column if not exists booking_link text;

alter table calls add column if not exists raw jsonb;

alter table telegram_messages add column if not exists compact text;

alter table leads add column if not exists hubspot_note_id text;

alter table leads add column if not exists designer_note text;

alter table leads add column if not exists contacted_at timestamptz;

alter table designers add column if not exists read_only boolean not null default false;
