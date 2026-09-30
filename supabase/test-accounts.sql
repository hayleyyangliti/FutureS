-- 先在 Authentication → Users 创建以下邮箱用户，并将初始密码设置为 123456，再运行本脚本。
-- 此脚本为现有的杨莉缇、王宇账号补齐工号、显示名和权限。

insert into public.profiles (auth_user_id, employee_no, display_name, email_prefix, department, role)
select id, '130118', '杨莉缇', 'yangliti', '网络金融部', 'developer'
from auth.users where email = 'yangliti@gtht.com'
on conflict (employee_no) do update set
  auth_user_id = excluded.auth_user_id,
  employee_no = excluded.employee_no,
  display_name = excluded.display_name,
  email_prefix = excluded.email_prefix,
  department = excluded.department,
  role = excluded.role,
  updated_at = now();

insert into public.profiles (auth_user_id, employee_no, display_name, email_prefix, department, role)
select id, '130117', '王宇', 'wangyu13', '网络金融部', 'developer'
from auth.users where email = 'wangyu13@gtht.com'
on conflict (employee_no) do update set
  auth_user_id = excluded.auth_user_id,
  employee_no = excluded.employee_no,
  display_name = excluded.display_name,
  email_prefix = excluded.email_prefix,
  department = excluded.department,
  role = excluded.role,
  updated_at = now();
