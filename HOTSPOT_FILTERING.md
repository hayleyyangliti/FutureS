# Hotspot filtering

The market-hotspots API keeps reports whose original body or summary contains at least 130 substantive characters. Price-tape, market-open, and market-close bulletins are excluded. Similar short headlines are clustered by event, and each item shows 1-3 verifiable source links.

The ECS collector requests commodity channels from Eastmoney, Wallstreetcn and Gelonghui, alongside general financial reporting. Its 500-article snapshot interleaves sources, taking newer reports within each source first. The reader admits coal-border and oil-shipping supply events even when the title does not name a futures contract. When qualified candidates exist, up to one quarter of Top 20 slots are reserved for domestic reports and another quarter for overseas reports; the remaining slots use the highest scores, and the final list stays in score order. Missing coverage is reported in pipeline counts rather than filled with invented stories.

This document records the production filtering behavior introduced by PR #1.
