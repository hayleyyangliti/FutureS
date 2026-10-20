# Hotspot model scoring

Historical implementation notes. The current production route is superseded by [MODEL_ONLY_NEWS.md](MODEL_ONLY_NEWS.md); rule helpers remain only for regression comparison and are not used for production admission or fallback.

This temporary stage retains four weights (importance 45, timeliness 25, information gain 20, futures relevance 10) and 1–3 sources. Standard reports require 130 substantive characters. The user-approved high-importance short-notice exception admits substantive policy/supply-event candidates of at least 12 characters only when actual model scores reach importance 30/45 and futures relevance 6/10. Rule fallback never admits these short notices. Pure price tape remains excluded, and short notices are visibly labelled with original character count. It scores up to 60 clustered candidates in batches of 20 before final Top 20 selection. Up to five domestic and five international slots are reserved when qualified candidates exist, with the final display sorted by total score. It does not invent absent reports or score the entire raw feed.

The authenticated analysis request sends original facts and up to three source excerpts to MiniMax first, then DeepSeek on timeout, HTTP failure, invalid/missing/duplicate IDs, invalid scores/reasons or unsupported evidence. Server-only existing credentials are reused. No browser keys or changes to Supabase privileges/schema are needed.

The model assesses importance, information gain and relevance. Time is computed deterministically from first publication using the existing tiers. Code validates integer bounds, exact item coverage and quoted relevance evidence, then sums and sorts. The original title, source links and excerpt stay unchanged; keywords do not grant fixed model points. No model output can supply HTML.

The initial quick response is visibly labelled rule provisional. The background result rerenders scores, order and AI Studio recommendations and exposes provider, model, reasons and evidence. If both providers fail the original rules remain explicitly provisional, never labelled model-scored.

Timeout is 18 seconds per provider within the existing 45-second function limit; up to three batches run concurrently. Identical candidate content shares an in-flight request and a five-minute process-local cache, including failures. Cold serverless instances may repeat requests; this is not durable per-round storage. Mixed model/fallback batches are marked PARTIALLY_SCORED and each displayed card retains its own scoring method. Model reasoning and remote billing are not verified by mock tests; production needs a signed-in refresh and an actual `MODEL` result.

Coverage diagnostics report raw snapshot rows, length rejection, relevance/tape rejection, pre-selection event count and geography counts per source. Body admission requires a commodity and a concrete supply/demand driver in the same sentence, or an explicit macro policy/data event. The longest actual text field is retained, including news_content/newsContent; object values cannot inflate the length gate. Shared home/channel URLs never serve as event identity, and clustering compares against one anchor rather than transitive chaining. Existing 50-percent similarity and same-speech grouping remain.

Tests: `node --test tests/*.test.js`. No package installation is needed.
