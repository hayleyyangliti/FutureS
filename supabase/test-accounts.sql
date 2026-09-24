-- 先在 Supabase Dashboard → Authentication → Users 中创建以下测试用户，
-- 再执行本文件。邮箱域名应与 Vercel 的 LOGIN_EMAIL_DOMAIN 一致。
-- 请自行设置强密码；不要使用 Demo 中旧的演示密码。

insert into public.profiles (auth_user_id, employee_no, display_name, email_prefix, department, role)
select id, '130118', '杨莉缇', 'yangliti', '', 'developer'
from auth.users where email = 'yangliti@futures-test.local'
on conflict (auth_user_id) do update set
  employee_no = excluded.employee_no,
  display_name = excluded.display_name,
  email_prefix = excluded.email_prefix,
  role = 'developer';

insert into public.profiles (auth_user_id, employee_no, display_name, email_prefix, department, role)
select id, '130117', '王宇', 'wangyu13', '', 'developer'
from auth.users where email = 'wangyu13@futures-test.local'
on conflict (auth_user_id) do update set
  employee_no = excluded.employee_no,
  display_name = excluded.display_name,
  email_prefix = excluded.email_prefix,
  role = 'developer';

-- 普通使用者示例：将邮箱、工号、姓名和邮箱前缀替换为真实测试值后再执行。
-- insert into public.profiles (auth_user_id, employee_no, display_name, email_prefix, department, role)
-- select id, '130119', '测试用户', 'testuser', '', 'user'
-- from auth.users where email = 'testuser@futures-test.local';
