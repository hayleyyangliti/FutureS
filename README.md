# 期市内容引擎 · 测试发布包

这是一个可独立上传 GitHub、部署至 Vercel 的测试发布包。它与 `outputs` 中的 Demo 源文件相互独立；此包内的前端是副本。

## 包内结构

```text
public/                 网站前端和静态 Logo
api/                    Vercel 服务端接口
supabase/schema.sql     数据表初始化脚本
supabase/test-accounts.sql  杨莉缇、王宇测试账号资料脚本
.env.example            Vercel 环境变量清单（无真实密钥）
```

## 1. 上传 GitHub

将本文件夹内的全部内容上传至一个新的 GitHub 仓库根目录。不要上传 `.env` 或任何 Supabase 密钥。

## 2. 配置 Supabase

1. 在 **Authentication → Users** 创建用户，并将初始密码统一设为 `123456`：
   - `yangliti@gtht.com`
   - `wangyu13@gtht.com`
2. 打开 **SQL Editor**，完整运行 `supabase/schema.sql`。
3. 再完整运行 `supabase/test-accounts.sql`。它会将两位用户分别关联为：
   - 杨莉缇 / 工号 `130118` / 开发者
   - 王宇 / 工号 `130117` / 开发者

最新用户资料以“用户信息汇总.xlsx”为准，共 86 人。刘宜琳（107481）的邮箱按确认修正为 liuyilin@gtht.com。先在 Authentication 创建缺少的邮箱账号，初始密码为 123456；已有账号保留当前密码。再运行 supabase/user-info-update.sql，按工号更新已创建用户的姓名、邮箱前缀、部门及关联。脚本只同步已经存在于 Authentication 的邮箱，不创建登录账号、不删除其他用户。前端使用完整邮箱登录，成功后显示中文姓名。两位固定开发者权限保留。

## 3. 配置 Vercel

导入 GitHub 仓库时：

- **Application Preset**：`Other`
- **Root Directory**：保持 `./`
- **Build Command**：留空
- **Output Directory**：留空（Vercel 会自动提供 `public/` 中的静态网站）
- **Install Command**：留空

在 **Environment Variables** 中新增以下六项，并选择 `Production and Preview`：

| Key | Value 来源 |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `LOGIN_EMAIL_DOMAIN` | `gtht.com` |
| `OMNIDATA_BASE_URL` | `https://omnidata-vercel-adapter.vercel.app` |
| `OMNIDATA_API_TOKEN` | OmniData 项目中设置的同名令牌 |

`SUPABASE_SERVICE_ROLE_KEY` 只能保存在 Vercel 服务端环境变量，绝不能粘贴到前端文件或提交 GitHub。
`OMNIDATA_API_TOKEN` 同样只能保存在 Vercel 服务端环境变量。市场热点中心会经由 `/api/market-hotspots` 请求 OmniData，浏览器不会获得该令牌。

部署后，访问 `https://你的域名/api/health`：若返回 `{ "ok": true }`，说明 Vercel 已读取到环境变量。

## 当前测试范围

- 已接入：邮箱＋密码登录、Supabase 用户资料和开发者角色读取。
- 已预置：案例数据表与 `GET/POST /api/cases` 接口，供下一阶段将案例库交互改为真实读写。
- 已接入：登录用户点击“刷新热点”时，通过服务端中转读取 OmniData 的东方财富期货快讯；页面初始示例数据仍保留，便于接口短暂不可用时继续评审。
- 后续接 Dataphin 时：由 Vercel 的服务端接口请求 Dataphin，再把数据返回前端；不要让浏览器直接持有 Dataphin 凭证。
