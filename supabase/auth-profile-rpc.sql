-- 登录资料读取修复：以已验证用户自身的令牌读取其个人资料。
-- 在当前 Supabase 项目的 SQL Editor 完整运行一次即可，可重复运行。

create or replace function public.current_profile()
returns table (
  id uuid,
  auth_user_id uuid,
  employee_no text,
  display_name text,
  email_prefix text,
  department text,
  role text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.auth_user_id,
    p.employee_no,
    p.display_name,
    p.email_prefix,
    p.department,
    p.role
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_profile() from public;
grant execute on function public.current_profile() to authenticated;
