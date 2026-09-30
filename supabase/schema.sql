-- 期市内容引擎：测试发布初始化脚本
-- 在 Supabase → SQL Editor 中整段运行。可重复运行。

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  employee_no text unique not null,
  display_name text not null,
  email_prefix text unique not null,
  department text,
  role text not null default 'user' check (role in ('user', 'developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- 兼容此前已创建过的旧表：create table if not exists 不会为旧表补充字段。
-- 以下语句仅补字段，不会删除已有的案例或用户资料。
alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists employee_no text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists email_prefix text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.content_cases add column if not exists library text default 'shared';
alter table public.content_cases add column if not exists owner_id uuid;
alter table public.content_cases add column if not exists content_type text;
alter table public.content_cases add column if not exists subtype text;
alter table public.content_cases add column if not exists title text;
alter table public.content_cases add column if not exists folder_path text default '未归档';
alter table public.content_cases add column if not exists content_platform_id text;
alter table public.content_cases add column if not exists content text;
alter table public.content_cases add column if not exists attachments jsonb default '[]'::jsonb;
alter table public.content_cases add column if not exists sources jsonb default '[]'::jsonb;
alter table public.content_cases add column if not exists starred boolean default false;
alter table public.content_cases add column if not exists saved_at timestamptz default now();
alter table public.content_cases add column if not exists updated_at timestamptz default now();

update public.content_cases set library = 'shared' where library is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_auth_user_id_key'
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

create index if not exists content_cases_library_saved_at_idx
  on public.content_cases (library, saved_at desc);
create index if not exists content_cases_type_subtype_idx
  on public.content_cases (content_type, subtype);
create index if not exists content_cases_content_platform_id_idx
  on public.content_cases (content_platform_id);

alter table public.profiles enable row level security;
alter table public.content_cases enable row level security;
alter table public.prompt_overrides enable row level security;
alter table public.content_share_requests enable row level security;

-- 测试包的 Vercel 接口通过 service_role 在服务端访问数据库；浏览器不会获得该密钥。
