# Hotspot filtering

The market-hotspots API keeps reports whose original body or summary contains at least 130 substantive characters. Price-tape, market-open, and market-close bulletins are excluded. Similar short headlines are clustered by event, and each item shows 1-3 verifiable source links.

This document records the production filtering behavior introduced by PR #1.
