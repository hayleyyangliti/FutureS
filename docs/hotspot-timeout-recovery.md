# Model timeout recovery

Production evidence: all 25 MiniMax batches timed out, 21 DeepSeek batches
timed out, and two DeepSeek responses failed count validation. The previous
20-record/18-second calls discarded entire batches on one invalid row.

The worker now uses five records per call, up to three concurrent batches,
60 seconds per provider, and a 190-second overall scoring deadline. MiniMax
remains primary; DeepSeek handles only missing/invalid rows with thinking
explicitly disabled. Validated rows are retained without relaxing scores,
admission, evidence, duplicate-ID or contract checks.

Successful decisions (including rejections) and attempted-record metadata are
saved to existing `omnidata_hotspot_jobs.detail.evaluations` before event
consolidation. Decisions are content/model/policy keyed, expire after 24h and
are capped at 2,000 records. The next invocation restores them even when raw
record IDs or the raw snapshot change. Failed records are retried after
never-attempted records. Deferred records are counted separately from failures
and are never assumed to be rejected or admitted. No browser model calls or
additional database grants are required.

After production deployment, update the existing named Supabase cron job:

```sql
select cron.schedule('futures-hotspot-background', '*/5 * * * *',
  'select futures_internal.dispatch_hotspots();');
select jobname, schedule, active from cron.job
where jobname = 'futures-hotspot-background';
```

The existing six-minute lease prevents concurrent same-snapshot work. The
190-second scoring limit reserves time for the existing 70-second maximum
consolidation attempts and persistence within the 300-second function limit.
Completed snapshots cause an inexpensive no-op on subsequent cron runs.
Partial jobs retain their checkpoints and remain resumable. A consolidation
failure leaves the previous published ranking readable and retains decisions.

Verify after a scheduled run using `payload.pipeline.modelStats`: `evaluated`,
`failed`, `deferred`, `pending`, and `reused`. Local mocks establish correctness
but do not prove provider availability, network latency, or production output
count. Do not claim 20 events until the saved production result confirms it.
