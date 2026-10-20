# OmniData 国内与供应链资讯覆盖更新

本次更新包含两部分：FutureS 的 `api/market-hotspots.js` 随 Vercel 发布；本目录的 `omnidata_news_cache.py` 需要更新到现有 ECS。只发布 Vercel 无法让服务器多采集资讯。

## ECS 更新

使用现有 admin 账号，将本目录中的 `omnidata_news_cache.py` 上传至 `/home/admin/omnidata_news_cache.coverage.py`。已有网关、定时器、密钥文件和数据库保持原位。

先保存原脚本，再安装并启动现有刷新服务：

```sh
cp -p /home/admin/OmniData/omnidata_news_cache.py /home/admin/OmniData/omnidata_news_cache.py.before-coverage-20261020
/home/admin/OmniData/.venv/bin/python -m py_compile /home/admin/omnidata_news_cache.coverage.py
install -m 0600 /home/admin/omnidata_news_cache.coverage.py /home/admin/OmniData/omnidata_news_cache.py
sudo systemctl start --no-block omnidata-news-refresh.service
journalctl -u omnidata-news-refresh.service -n 30 --no-pager -o cat
```

新策略会在同一个半小时时段内重新采集一次，随后恢复既有半小时定时器。来源失败会记录错误并保留旧内容，不阻止其他来源刷新。不要在日志或聊天中输出 `.supabase-sync.env` 或 API Key。

## 内容策略

- 19 个既有 OmniData 来源进入采集清单；东方财富请求期货/数据栏目，华尔街见闻请求商品频道，格隆汇请求商品外汇频道。
- 500 条快照按来源轮流取新资讯，避免后采集或高频来源挤掉国内媒体。
- 130 字门槛、1—3 个来源及行情快讯过滤继续生效。
- 在确有合格候选时，Top 20 为国内、海外各预留最多 5 条，剩余名额由综合分数选取；最终仍按分数降序。
- 口岸、蒙煤、伊朗能源与苏伊士/霍尔木兹航运事件进入相关性判断；未采集到的资讯不会被补造。

本地验证：15 项热点接口测试、4 项模型接口测试、1 项缓存覆盖回归测试通过。上线后仍需核对服务器实际采集结果、Supabase 快照更新时间及国内/海外候选计数。
