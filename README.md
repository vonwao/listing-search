# Listing Search

A React/TypeScript UI backed by a Python/FastAPI API. Searches the supplied 12-record JSON dataset with price, bedroom, city, and description filters, then ranks and paginates the matches.

## Run locally

Requires Python 3.12+ and Node.js 22.12+ (tested with Python 3.12, Python 3.14 and Node 24). No database, cloud account, or API key is needed.

From this folder, using PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Open **http://127.0.0.1:8001**. The Python server serves both the built UI and API. Stop with Ctrl+C. After first-time setup, `Start Demo.cmd` runs this command again.

On macOS/Linux use `python3` and `.venv/bin/python` in place of the Windows commands.

For live development, run the API with `--reload`, then `npm run dev` in `frontend` in a second terminal. Open http://127.0.0.1:5175; Vite proxies `/api` to port 8001, so no permissive CORS policy is needed. Rebuild and restart the Python server after changing the built UI.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd frontend
npm test
npm run build
```

Backend tests cover combined filters, ranking, source/ID ties, invalid values, no matches, page boundaries, and HTTP validation. UI tests cover actual form submissions, pagination reset, loading, empty results, retry after a failure, and stale responses. The TypeScript build checks the client types.

## API and ranking

`GET /api/listings?city=Springfield&targetBudget=500000&page=1&pageSize=6`

All filters are optional: `minPrice`, `maxPrice`, `minBedrooms`, `city`, `keyword`, `targetBudget`. Prices are inclusive; city is an exact case-insensitive match after trimming. Keyword is a case-insensitive substring of the **description only**. `page` defaults to 1 and `pageSize` to 6 (maximum 100).

For each matching listing:

```text
ageDays = max(0, UTC today - listedDate)
recency = 1 / (1 + ageDays / 30)
budgetMatch = max(0, 1 - abs(price - targetBudget) / targetBudget)
relevance = 100 * (0.7 * budgetMatch + 0.3 * recency)
```

Without a budget, relevance is `100 * recency`. Scores are bounded from 0–100. A listing exactly at budget and listed today scores 100; the same price at 30 days old scores 85. Under- and over-budget prices are penalized equally: use `maxPrice` for a hard ceiling. The 70/30 weights prioritize price fit while still rewarding freshness; they are an explicit product assumption, not a learned model. Recency decays smoothly rather than making every old record score zero. Future dates clamp to today. The API returns the UTC scoring date.

Rank using unrounded scores. Break ties by lower price, so an under-budget home beats an equally distant over-budget one, then by `(source, id)` for a stable order. Round displayed scores only. Filter and sort **before** pagination. A valid search that finds nothing is a result rather than a failed request, so it returns HTTP 200 with a `message` saying why: unknown cities and empty filter combinations return zero matches, and pages beyond the end return an empty list with the original totals. Invalid ranges, negative values, non-finite numbers, noninteger page/bedroom values, and unknown query fields return HTTP 422 with field/message details. `targetBudget` must be positive.

## Choices and limits

- Keep feeds separate. `(source, id)` is the identity. Four sample pairs (A1/B7, A2/B8, A3/B9, A5/B11) share identical coordinates and are probably the same home, but their prices differ, one pair's ZIP differs, and there is no rule for which record to trust. Both records are shown, so a page can list the same home twice. Merging needs a matching rule and a conflict policy.
- Recency has a small effect on older data. On October 30, 2026, sample recency scores ranged from 24 to 35, moving the final score by about 3 points while budget match moved it by about 12. Recency mostly separates close candidates, and scores fall slightly each day.
- Include active, pending, and sold records because the brief does not specify an active-only filter.
- Literal keyword search is not semantic: “pets” matches “no pets”. A pet-policy filter would need structured data or an explicit interpretation rule.
- Load and validate the small immutable dataset once. Search costs O(n), sorting O(m log m), and memory O(m) for m matches. A larger or changing dataset would warrant database indexes, ingestion validation, and stable snapshot/cursor pagination.
- Keep money as numbers for comparison/scoring only; this app performs no currency transactions. Production financial arithmetic would use integer cents or decimal values.
- The UI submits on Search, resets to page 1 when filters change, and aborts obsolete requests. Draft inputs do not change results until submitted.
- This is a local assessment, with no authentication, persistence, geospatial matching, or production deployment. No external map or image service is used.

## Assumptions to confirm

These are the questions I would ask before treating this as final:

- Should sold or pending listings appear in search? They are currently included and labeled.
- Should records for the same home be merged, and which feed wins when they disagree?
- Should a city with no matches be an API error? It currently returns HTTP 200 with a `message`, because the search was valid and found nothing.
- Should under-budget homes be penalized less than over-budget ones? They are currently treated equally.
- Should keyword search understand meaning? “pets” currently matches both “pets allowed” and “no pets”.

AI assistance was used for the initial implementation and tests, as permitted by the assessment. Dependencies are pinned in `requirements.txt` and `frontend/package-lock.json`; framework references: [FastAPI query models](https://fastapi.tiangolo.com/tutorial/query-param-models/) and [Vite setup](https://vite.dev/guide/).
