# FoodFolio backend

One Lambda behind an HTTP API that turns a recipe link or a photo into structured Hebrew recipe data.

```
app ──POST /import──▶ HTTP API (throttled) ──▶ Lambda ──▶ model (structured output)
                                                 │
                                                 ├─ DynamoDB: daily caps (per install / IP / global)
                                                 └─ SSM: model API key
```

## Request / response

`POST /import` with header `X-Install-Id` (random per install, created by the app).

```json
{ "type": "url", "url": "https://…", "categories": ["קינוחים", "סלטים"] }
{ "type": "image", "image": "<base64 JPEG, ≤ 4 MB>", "categories": [] }
{ "type": "html", "url": "https://…", "html": "<page the phone fetched>", "categories": [] }
{ "type": "text", "text": "<pasted recipe text>", "categories": [] }
```

`200 {"recipe": {title, servings, total_minutes, ingredients[{name, quantity, unit, department, estimated}], steps[], tags[], fridge_days, suggested_category}}`

`html` is used when a site refuses server requests (HTTP 403): the app downloads the page itself and sends it. `text` carries pasted captions.

`POST /substitute` takes `{ingredient, quantity, unit, recipe_title, other_ingredients[]}` and returns `{options: [{name, quantity, unit, note}]}` (at most 3, sized for the recipe amount).

Errors are `{"error": {"code", "message"}}`: `bad_request` 400, `rate_limited` 429, `not_a_recipe` 422,
`fetch_failed` 502, `upstream_error` 502, `internal_error` 500.
`unit` and `department` are always values the app already knows (`src/foodfolio/schemas.py`).

## Layout

| File | Job |
|---|---|
| `handler.py` | Lambda entry: routing, validation, error mapping, logging |
| `service.py` | The use case, plus code-side clean-up of model output |
| `fetch.py` | SSRF-safe page download |
| `extract.py` | HTML → JSON-LD recipe or visible text (no per-site scrapers) |
| `llm.py`, `prompts.py` | The only code that knows about the model |
| `ratelimit.py` | Daily caps in DynamoDB |
| `schemas.py`, `config.py`, `errors.py` | Shapes, settings, HTTP errors |

## Security model

- **Untrusted URLs:** http(s) only, ports 80/443, every hop (including redirects) must resolve to public
  addresses, size and time capped. The Lambda runtime API and metadata endpoints are unreachable.
- **Untrusted page text:** wrapped in a delimiter the page cannot close; the model has no tools and can only
  return a schema-bound recipe, so injected instructions have nothing to act on. Output is validated and clamped.
- **Abuse and cost:** per-install, per-IP and global daily caps are checked *before* any model call, on top of
  API throttling, a Lambda timeout, an output-token cap and an AWS Budget alert. The global cap is the hard
  ceiling on daily spend.
- **Secrets:** the API key lives in SSM Parameter Store, never in the template or the app.
- **Privacy:** requests are sent with `store=false`; logs hold outcome, type, host and timing only, never recipe
  text, full URLs or images.
- **Known limit:** the install id can be forged, so the per-IP and global caps are what actually bound abuse.
  Stronger identity (Play Integrity / App Attest) is the next step if the app grows.

## Cost

`gpt-6-luna` is listed at $0.10 / 1M input and $0.50 / 1M output tokens (flex and batch are 50%). A typical import
is a few thousand input tokens and ~1.5k output tokens, so well under $0.002 per recipe. At the global cap of
1,500 imports/day the model bill tops out around a few dollars a day, and Lambda, HTTP API and DynamoDB add cents.

## Develop

```bash
cd Backend
pip install -e ".[dev]"
ruff check . && pytest
```

## Deploy

```bash
aws ssm put-parameter --name /foodfolio/llm-api-key --type SecureString --value "<key>"
sam build
sam deploy --guided --parameter-overrides AlertEmail=you@example.com
```

Then set `EXPO_PUBLIC_API_URL` to the `ApiUrl` output for the app build.

Config knobs (template parameters or env): `LlmModel`, `LlmBaseUrl` (any OpenAI-compatible endpoint, e.g. Bedrock's),
`LLM_REASONING_EFFORT`, `LLM_SERVICE_TIER`, the three `LIMIT_*` caps, `ReservedConcurrency`, `MonthlyBudgetUsd`.

> The template and model call have not been deployed or run against the live API yet; the unit tests use fakes.

## Model host: OpenAI directly vs Bedrock

The code talks to any OpenAI-compatible Responses endpoint, so switching is configuration only.

| | OpenAI directly (default) | Amazon Bedrock (`bedrock-runtime`) |
|---|---|---|
| Model id | `gpt-6-luna` (check with the models list before the first deploy) | `global.openai.gpt-5.6-luna` |
| Price per 1M tokens | $0.10 in / $0.50 out, Flex tier at 50% | $0.20 in / $1.20 out (global profile) |
| Auth | API key in SSM | Bedrock API key in SSM (IAM-only auth is not documented for this endpoint) |
| Where it runs | OpenAI's US infrastructure by default | Global cross-region inference, so no residency benefit |
| Extras | Flex and batch tiers, EU data residency option | One AWS bill and CloudTrail, Guardrails |

To switch: set `LLM_BASE_URL=https://bedrock-runtime.<region>.amazonaws.com/openai/v1`, `LlmModel=global.openai.gpt-5.6-luna`
and store a Bedrock API key as the SSM parameter. No code change.

## Region

Recommended: `il-central-1` (Tel Aviv), because the Lambda fetches recipe pages and some Israeli sites block foreign IPs.
Fallback: `eu-central-1` (Frankfurt). Confirm Lambda, API Gateway, DynamoDB and SSM are available in the chosen region
with a first `sam deploy`; the template itself is region-independent.
