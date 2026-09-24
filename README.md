# 期市内容引擎 · 发布包

这是一个可直接上传 GitHub 并部署到 Vercel 的发布目录。前端 Demo 位于 `public/`，Vercel 接口位于 `api/`，Supabase 数据库初始化脚本位于 `supabase/schema.sql`。

## 目录说明

- `public/index.html`：当前完整 Demo 页面。
- `public/assets/`：页面所需 Logo 素材。
- `api/health.js`：环境检查接口，部署后访问 `/api/health`。
- `api/auth/login.js`、`api/me.js`：Supabase Auth 登录和当前角色读取接口。
- `api/accounts.js`：仅开发者可读取的账号列表接口。
- `api/cases.js`：按角色保护的案例库读取与新增接口，支持 `GET /api/cases`、`POST /api/cases`。
- `supabase/schema.sql`：基础账号、案例、Prompt 个性化版本和内容申请表。
- `supabase/test-accounts.sql`：杨莉缇、王宇两个开发者测试账号的角色初始化脚本。
- `.env.example`：Vercel 环境变量模板；不可提交真实密钥。

## 第一次发布

1. 在 GitHub 新建一个**私有**空仓库，例如 `futures-content-engine`，将本文件夹内的全部文件上传至仓库根目录。
2. 在 Supabase 新建项目，打开 **SQL Editor**，完整执行 `supabase/schema.sql`。
3. 在 Supabase 的 **Authentication → Users** 中创建测试用户。Supabase 内部登录邮箱使用“邮箱前缀@测试域名”的形式，例如 `yangliti@futures-test.local`；测试期间如不便收取确认邮件，可在 Authentication 设置中关闭 Confirm email。前端用户实际输入的是工号，服务端会根据工号匹配对应的邮箱前缀。
4. 运行 `supabase/test-accounts.sql`，将杨莉缇（130118）和王宇（130117）写入开发者角色。创建普通使用者后，也按文件内示例新增对应的 `profiles` 记录。
5. 在 Supabase 的 **Project Settings → API** 中复制项目 URL、`anon` 密钥与 `service_role` 密钥。
6. 在 Vercel 导入 GitHub 仓库，在 **Settings → Environment Variables** 新增：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LOGIN_EMAIL_DOMAIN`（例如 `futures-test.local`，必须与测试用户邮箱域名一致）
   - 可选：`APP_ORIGIN`（部署完成后的站点地址）
7. 重新部署后访问 `https://你的域名/api/health`。`supabaseConfigured`、`authConfigured` 都为 `true` 即说明后端环境已就绪。随后可用工号和密码登录页面；登录后导航栏显示邮箱前缀。

## 当前边界

本次发布包已将前端、数据表和案例接口放在同一仓库。发布页面的登录已强制使用 Supabase Auth，并在服务端读取角色：开发者可读取账号列表、读取或新增百宝箱案例；普通使用者只能读取百宝箱与自己的个人案例，不能直接向百宝箱新增案例。当前 Demo 的案例展示数据仍保留本地演示版本，尚未自动改为调用 `/api/cases`；这样可先稳定测试 UI 与登录权限。评审通过后，再将案例库、账号、Prompt 和数据看板逐步切换到 Supabase 或公司正式接口。

当前 Demo 的登录与账号数据也仅用于界面测试，不能作为公开生产环境的认证方式。`SUPABASE_SERVICE_ROLE_KEY` 仅能配置在 Vercel 环境变量中，绝不能写入 `public/`、HTML 或 GitHub 仓库。上线公司环境前，还需要接入企业 SSO，并为各角色补充 RLS 权限策略。
