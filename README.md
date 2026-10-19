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
4. 最后完整运行 `supabase/auth-profile-rpc.sql`。它创建一个只允许“已登录用户读取自己资料”的安全接口，避免登录流程受 Vercel 服务端角色密钥或资料表 RLS 配置影响。

最新用户资料以“用户信息汇总.xlsx”为准，共 86 人。刘宜琳（107481）的邮箱按确认修正为 liuyilin@gtht.com。先在 Authentication 创建缺少的邮箱账号，初始密码为 123456；已有账号保留当前密码。再运行 supabase/user-info-update.sql，按工号更新已创建用户的姓名、邮箱前缀、部门及关联。脚本只同步已经存在于 Authentication 的邮箱，不创建登录账号、不删除其他用户。前端使用完整邮箱登录，成功后显示中文姓名。两位固定开发者权限保留。

## 3. 配置 Vercel

导入 GitHub 仓库时：

- **Application Preset**：`Other`
- **Root Directory**：保持 `./`
- **Build Command**：留空
- **Output Directory**：留空（Vercel 会自动提供 `public/` 中的静态网站）
- **Install Command**：留空

在 **Environment Variables** 中新增以下七项，并选择 `Production and Preview`：

| Key | Value 来源 |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `LOGIN_EMAIL_DOMAIN` | `gtht.com` |
| `OMNIDATA_BASE_URL` | 你的 OmniData 服务地址，例如 `https://omnidata-vercel-adapter-production.up.railway.app` |
| `OMNIDATA_API_TOKEN` | OmniData 项目中设置的同名令牌 |
| `MINIMAX_API_KEY` | MiniMax 开放平台生成的 API Key，仅供服务端调用 |
| `DEEPSEEK_API_KEY` | DeepSeek 开放平台生成的 API Key，仅供服务端调用；启用 DeepSeek 时必填 |

可选新增 `MINIMAX_MODEL` 和 `DEEPSEEK_MODEL`。若未设置，分别调用 `MiniMax-M2.7` 和 `deepseek-flash`。已有 MiniMax 配置和默认选项保持不变。

`SUPABASE_SERVICE_ROLE_KEY` 只能保存在 Vercel 服务端环境变量，绝不能粘贴到前端文件或提交 GitHub。
`OMNIDATA_API_TOKEN` 同样只能保存在 Vercel 服务端环境变量。市场热点中心会经由 `/api/market-hotspots` 请求 OmniData，浏览器不会获得该令牌。
`MINIMAX_API_KEY` 与 `DEEPSEEK_API_KEY` 都只由 `/api/ai/generate` 在服务端读取，浏览器不会获得密钥。AI Studio 的模型下拉框可选择 MiniMax 或 DeepSeek；“开始生成内容”会把当前选题、内容分类、生成指令和所选模型发送至服务端，由服务端调用对应模型 API。切换模型不会自动回退到另一模型。上传参考文件目前只展示文件名，尚未将文件正文解析后发送给模型。

### 市场热点中心：配置准入信源

`刷新热点` 不会也不应盲目运行 OmniData 中的全部爬虫。它会先读取 OmniData 已注册爬虫列表，再只运行 Vercel 环境变量 `OMNIDATA_HOTSPOT_SOURCES` 中明确准入的公开、期货相关信源（最多 8 个），随后完成聚类去重、四维评分、分类和 Top 20 排序。

在 Vercel 新增 `OMNIDATA_HOTSPOT_SOURCES`，值为一行 JSON，例如：

```json
[
  {"spider":"eastmoney_fast_news","params":{"page_size":20,"fast_column":"113"},"grade":"B类·已核验","label":"东方财富期货快讯"}
]
```

每个对象的 `spider` 必须与 OmniData `GET /api/v1/spiders` 返回的名称完全一致；`params` 必须符合该爬虫的参数要求。A 类仅用于官方机构、监管、交易所及正式公告等来源；完成来源核验的财经媒体使用 B 类。不要把 API Token 放进此 JSON 或前端代码。

部署后，访问 `https://你的域名/api/health`：若返回 `{ "ok": true }`，说明 Vercel 已读取到环境变量。

## 当前测试范围

- 已接入：邮箱＋密码登录、Supabase 用户资料和开发者角色读取。
- 已接入：AI Studio 通过服务端调用 MiniMax 或 DeepSeek 生成内容初稿；模型输出仍必须经人工核验后再保存或发布。
- 已预置：案例数据表与 `GET/POST /api/cases` 接口，供下一阶段将案例库交互改为真实读写。
- 已接入：登录用户点击“刷新热点”时，通过服务端读取 OmniData 爬虫注册表，并调用已配置的准入信源；结果会经过聚类去重、重要性/时效性/信息增量/期货相关性四维评分、品类归属和 Top 20 排序。未配置准入清单时仅兼容东方财富快讯，不能代表完整热点池。
- 后续接 Dataphin 时：由 Vercel 的服务端接口请求 Dataphin，再把数据返回前端；不要让浏览器直接持有 Dataphin 凭证。
