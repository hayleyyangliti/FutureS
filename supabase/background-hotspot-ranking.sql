-- One-time production setup. All data access remains server-only.
create table if not exists public.omnidata_hotspot_rankings (
  id text primary key check (id='current'),
  payload jsonb not null,
  source_refreshed_at timestamptz not null,
  generated_at timestamptz not null default now()
);
create table if not exists public.omnidata_hotspot_jobs (
  job_key text primary key,
  lease_token uuid not null,
  locked_until timestamptz not null,
  status text not null default 'running',
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.omnidata_hotspot_rankings enable row level security;
alter table public.omnidata_hotspot_jobs enable row level security;
revoke all on public.omnidata_hotspot_rankings,public.omnidata_hotspot_jobs from public,anon,authenticated;
grant select,insert,update on public.omnidata_hotspot_rankings,public.omnidata_hotspot_jobs to service_role;
create or replace function public.claim_omnidata_hotspot_job(p_key text,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$
  with claimed as (
    insert into public.omnidata_hotspot_jobs(job_key,lease_token,locked_until,status)
    values(p_key,p_token,now()+interval '6 minutes','running')
    on conflict(job_key) do update set lease_token=excluded.lease_token,locked_until=excluded.locked_until,status='running',updated_at=now()
    where public.omnidata_hotspot_jobs.locked_until<now() and public.omnidata_hotspot_jobs.status<>'completed'
    returning 1
  ) select exists(select 1 from claimed);
$$;
create or replace function public.publish_omnidata_hotspot_ranking(p_payload jsonb,p_source_version timestamptz)
returns boolean language sql security invoker set search_path='' as $$
  with published as (
    insert into public.omnidata_hotspot_rankings(id,payload,source_refreshed_at,generated_at)
    values('current',p_payload,p_source_version,now())
    on conflict(id) do update set payload=excluded.payload,source_refreshed_at=excluded.source_refreshed_at,generated_at=now()
    where public.omnidata_hotspot_rankings.source_refreshed_at<=excluded.source_refreshed_at
    returning 1
  ) select exists(select 1 from published);
$$;
revoke all on function public.claim_omnidata_hotspot_job(text,uuid),public.publish_omnidata_hotspot_ranking(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_omnidata_hotspot_job(text,uuid),public.publish_omnidata_hotspot_ranking(jsonb,timestamptz) to service_role;
