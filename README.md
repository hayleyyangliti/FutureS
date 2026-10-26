# 期市内容引擎

期市内容引擎将可追溯的公开财经资讯、热点筛选与 AI 内容生产流程整合为一个运营工作台。

## 项目结构

```text
public/                 网站前端和静态资源
api/                    Vercel 服务端接口
supabase/               数据表、认证与资料脚本
.env.example            环境变量清单（不含真实密钥）
```

## 部署

1. 将仓库导入 Vercel。
2. Application Preset 选择 `Other`，Root Directory、Build Command、Output Directory 和 Install Command 均保持默认或留空。
3. 在 Vercel 的 Production 与 Preview 环境配置以下服务端变量：

| Key | 用途 |
|---|---|
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_ANON_KEY` | Supabase 匿名访问密钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端角色密钥 |
| `LOGIN_EMAIL_DOMAIN` | 允许登录的邮箱域名 |
| `OMNIDATA_BASE_URL` | OmniData 服务地址 |
| `OMNIDATA_API_TOKEN` | OmniData 服务令牌 |
| `MINIMAX_API_KEY` | MiniMax 服务端 API Key |
| `DEEPSEEK_API_KEY` | DeepSeek 服务端 API Key |

可选变量 `MINIMAX_MODEL` 与 `DEEPSEEK_MODEL` 用于指定模型版本。所有密钥必须只保存在 Vercel 服务端环境变量中，严禁写入前端、提交记录或公开文档。

## 使用说明

- 登录账号由项目管理员在 Supabase Authentication 中创建并按内部权限流程配置。
- AI Studio 默认使用 MiniMax，也可切换至 DeepSeek。
- 内容生产会保留选题关联的、可验证的公开资料来源，并在结果末尾展示可跳转的原始链接；生成内容仍须经过人工核验后再发布。
- 市场热点中心只展示具有可验证原文链接、满足时效性与期货相关性规则的资讯。
- 热点缓存由 OmniData 定时同步。个别信源不可用时，系统会保留最近一次可用快照并在后台显示采集状态。

## 安全说明

- 不要提交 `.env`、访问令牌、真实 API Key 或任何个人账号信息。
- `SUPABASE_SERVICE_ROLE_KEY`、`OMNIDATA_API_TOKEN`、`MINIMAX_API_KEY` 与 `DEEPSEEK_API_KEY` 仅可用于服务端。
- 对外发布前，请复核当前分支、环境变量、公开文档和提交历史中是否包含敏感信息。
