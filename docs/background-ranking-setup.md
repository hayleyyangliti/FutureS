# 后台热点榜单启用

代码采用安全分阶段切换：在第一份后台榜单成功写入前保留旧接口，避免空表导致线上没有资讯。
完成下列配置并验证前，不应宣称后台刷新已启用。

1. 在正确的 Supabase 项目执行 supabase/background-hotspot-ranking.sql。
   两张表仅 service_role 可访问；不要向浏览器开放读写权限。
2. 在 Vercel Production 添加 Secret 类型 HOTSPOT_JOB_SECRET，并重新部署。
   用户自行创建并保存一个长随机值，不要发到聊天中。
3. 在 ECS /home/admin/OmniData/.hotspot-job.env 保存相同的 HOTSPOT_JOB_SECRET=值，
   文件所有者 admin，权限 0600。不要修改现有 Supabase 凭据。
4. 上传 scripts/trigger-hotspot-ranking.py 到 /home/admin/OmniData/trigger_hotspot_ranking.py。
   先手动执行 Python 脚本，确认返回 PUBLISHED；查询数据库榜单时间和展示数。
5. 使用 systemctl edit omnidata-news-refresh.service 添加以下 drop-in。
   原有采集命令不变，忽略回调失败以保留采集服务正常运行。

       [Service]
       ExecStartPost=-/home/admin/OmniData/.venv/bin/python /home/admin/OmniData/trigger_hotspot_ranking.py

   执行 sudo systemctl daemon-reload。原有半小时 timer 不变。
   不要重新安装旧 coverage.py，以免覆盖服务器已经修复的采集参数。
6. 验证一个完整的半小时周期：采集同步成功、后台 PUBLISHED、榜单 generated_at 更新、
   前端 GET 返回 pipeline.mode=BACKGROUND_RANKING，刷新不再调用 analysis=1。

合格事件不足20时展示实际数量，不复制、拆分或编造资讯补足。
近期池仅保留24小时内模型已准入记录；跨来源同事件合并，最多展示3家来源。
后台失效时前端仍返回最近完成的榜单，并根据快照时间提示过期。
Vercel Hobby 不支持半小时 Cron，因此由原有 ECS 定时采集服务触发，不更改付费套餐。
