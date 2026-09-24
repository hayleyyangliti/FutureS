create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  employee_no text unique,
  display_name text not null,
  email_prefix text unique,
  department text,
  role text not null default 'user' check (role in ('user', 'developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

create table if not exists public.content_cases (
  id uuid primary key default gen_random_uuid(),
  library text not null default 'shared' check (library in ('shared', 'personal')),
  owner_id uuid references public.profiles(id) on delete set null,
  content_type text not null,
  subtype text,
  title text not null,
  folder_path text not null default '未归档',
  content_platform_id text,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  starred boolean not null default false,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_cases_library_saved_at_idx on public.content_cases (library, saved_at desc);
create index if not exists content_cases_type_subtype_idx on public.content_cases (content_type, subtype);
create index if not exists content_cases_content_platform_id_idx on public.content_cases (content_platform_id);

create table if not exists public.prompt_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  prompt_key text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique (owner_id, prompt_key)
);

create table if not exists public.content_share_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.content_cases(id) on delete cascade,
  requester_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.content_cases enable row level security;
alter table public.prompt_overrides enable row level security;
alter table public.content_share_requests enable row level security;

-- 本发布包的 Vercel 接口使用 service-role key，因此可在 RLS 开启状态下工作。
-- 正式接入登录体系后，请根据 auth.uid() 和 role 增加面向客户端的精细化策略。
