# Hotspot model scoring

This temporary stage retains four weights (importance 45, timeliness 25, information gain 20, futures relevance 10), existing admission, 130-character minimum, 1–3 sources and domestic/international coverage selection. It scores the existing selected Top 20; it does not yet score the entire raw feed or introduce new admission decisions.

The authenticated analysis request sends original facts and up to three source excerpts to MiniMax first, then DeepSeek on timeout, HTTP failure, invalid/missing/duplicate IDs, invalid scores/reasons or unsupported evidence. Server-only existing credentials are reused. No browser keys or changes to Supabase privileges/schema are needed.

The model assesses importance, information gain and relevance. Time is computed deterministically from first publication using the existing tiers. Code validates integer bounds, exact item coverage and quoted relevance evidence, then sums and sorts. The original title, source links and excerpt stay unchanged; keywords do not grant fixed model points. No model output can supply HTML.

The initial quick response is visibly labelled rule provisional. The background result rerenders scores, order and AI Studio recommendations and exposes provider, model, reasons and evidence. If both providers fail the original rules remain explicitly provisional, never labelled model-scored.

Timeout is 18 seconds per provider within the existing 45-second function limit. Identical candidate content shares an in-flight request and a five-minute process-local cache, including failures. Cold serverless instances may repeat requests; this is not durable per-round storage. Model reasoning and remote billing are not verified by mock tests; production needs a signed-in refresh and an actual `MODEL` result.

Tests: `node --test tests/*.test.js`. No package installation is needed.
