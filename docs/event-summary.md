# Background event summaries

The final selected Top 20 now pass through a dedicated model summarizer after
cross-source event grouping. Both single-source and multi-source events use
this step. `mergeGroups` preserves original reports as evidence instead of
constructing publisher-prefixed excerpt concatenations.

The summarizer asks for concise, rewritten Chinese factual summaries: the
event, essential data and actual incremental developments, with syndicated
facts stated once. It prohibits unsupported causality, trading advice and
upgrading uncertainty (for example an exercise into an actual strike). Links
and publisher attribution remain in the existing source list.

MiniMax is primary and DeepSeek retries missing/invalid summaries with thinking
disabled. Four concurrent batches of at most five selected events share a
45-second deadline. The worker's scoring phase is reduced to 150 seconds;
existing consolidation is bounded to 70 seconds, leaving room for summaries
and persistence within the 300-second function limit. Browser refresh remains
a read of the saved ranking, not a model request.

Validation requires real continuous evidence quotes, rejects duplicate IDs,
copy-paste extracts, publisher-concatenation templates and invented Arabic
number tokens. These checks do not guarantee semantic entailment; production
summary quality still needs visual verification.

Successful summaries are reused only for the same content/model/policy input
hash. The input hash and internal evidence are stripped from frontend API
responses. If both providers fail, the event stays in the ranking with an
explicit pending-summary message, not raw excerpts mislabeled as a summary.
`summaryPending` keeps the background job resumable even if scoring completed.

Worker keys advance to `model-v3-` so already-completed snapshots can receive
the new summary step. Existing v2/v3 decision checkpoints are reused; no new
tables, SQL, credentials, grants or cron changes are needed.
