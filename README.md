# Link Ticket Co. — Serverless URL Shortener

A fully serverless URL shortener on AWS — paste a long URL, get back a short
one, redirect at scale, pay nothing. Built to run entirely within AWS's
Always Free tier.

**Live demo:** _add your GitHub Pages URL here once deployed_

---

## Stack

| Layer | Service | Why |
|---|---|---|
| API | Amazon API Gateway (HTTP API) | Routing, throttling, CORS |
| Compute | AWS Lambda (Node.js 20) | Zero idle cost, scales to zero |
| Database | Amazon DynamoDB (on-demand) | Single-digit ms lookups, no idle cost |
| IaC | AWS SAM / CloudFormation | Declarative, one-command deploy |
| Frontend | Static HTML/CSS/JS | Hosted free on GitHub Pages |

No EC2, no NAT Gateway, no RDS — nothing in this stack has an idle cost or a
12-month free-tier countdown, except the frontend host (GitHub Pages, which
is free indefinitely anyway).

---

## Architecture

```
                     ┌─────────────────┐
  Browser  ───POST──▶│  API Gateway     │
 (frontend)           │  (HTTP API)     │
                     └────────┬────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        ┌──────────────┐          ┌──────────────┐
        │ShortenFunction│          │RedirectFunction│
        │   (Lambda)    │          │   (Lambda)     │
        └───────┬───────┘          └───────┬────────┘
                 │                          │
                 └───────────┬──────────────┘
                              ▼
                     ┌─────────────────┐
                     │   DynamoDB       │
                     │  (UrlTable)      │
                     └─────────────────┘
```

`POST /shorten` → `ShortenFunction` generates a 6-character code, writes
`{code, url, clicks, createdAt}` to DynamoDB, returns the short URL.

`GET /{code}` → `RedirectFunction` looks up the code, increments a click
counter (fire-and-forget), and responds with a `301` redirect to the
original URL.

---

## Project structure

```
url-shortener/
├── template.yaml           # SAM/CloudFormation stack definition
├── SETUP_GUIDE.md          # full beginner walkthrough, start to finish
├── src/
│   ├── shorten/
│   │   ├── index.js        # POST /shorten handler
│   │   └── package.json
│   └── redirect/
│       ├── index.js        # GET /{code} handler
│       └── package.json
└── frontend/
    └── index.html          # standalone ticket-themed UI, deploy anywhere static
```

---

## Quick start

Full walkthrough (including AWS account setup, IAM, and CLI installation)
is in [`SETUP_GUIDE.md`](./SETUP_GUIDE.md). Short version if you already
have AWS CLI + SAM CLI configured:

```bash
sam build
sam deploy --guided
```

Grab the `ApiUrl` output, then either test directly:

```bash
curl -X POST "$API_URL/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

...or point `frontend/index.html`'s `API_URL` constant at it and deploy the
page to GitHub Pages / Cloudflare Pages / any static host.

---

## API reference

### `POST /shorten`

**Request body:**
```json
{ "url": "https://example.com/some/long/path" }
```

**Response `200`:**
```json
{ "shortUrl": "https://xxxxx.execute-api.us-east-1.amazonaws.com/AbC123" }
```

**Response `400`** — missing or invalid `url`:
```json
{ "error": "Valid 'url' is required" }
```

### `GET /{code}`

Returns `301` with a `Location` header pointing at the original URL, or
`404` if the code doesn't exist.

---

## Rate limiting

The API Gateway route is throttled at the stage level (see `template.yaml`):

- 10 requests/sec steady state
- 20 requests burst allowance

This is enforced before requests reach Lambda, so it also caps worst-case
compute cost under a flood. Tune `ThrottlingRateLimit` /
`ThrottlingBurstLimit` in `template.yaml` if you need different limits.

---

## Cost

Everything here runs on AWS Always Free tier limits:
- Lambda: 1M requests + 400,000 GB-seconds/month
- DynamoDB: 25 GB storage, on-demand pricing scales with actual usage
- API Gateway HTTP API: 1M calls/month free for 12 months from account
  creation, then ~$1/million after

A zero-spend AWS Budget alert is recommended (see `SETUP_GUIDE.md`, Part 2)
so you're notified the instant anything would bill.

---

## Security notes

- IAM permissions are scoped per-function via SAM policy templates
  (`DynamoDBReadPolicy` / `DynamoDBWritePolicy`) — each Lambda can only
  touch the one table it needs, nothing else in the account.
- CORS on the API is currently open (`AllowOrigins: "*"`) for ease of setup —
  tighten this to your actual frontend domain before treating this as
  production (see `SETUP_GUIDE.md`, Part 12.4).
- No authentication on the API — anyone with the URL can create short links.
  Fine for a demo/personal project; add an API key or Cognito authorizer
  before exposing this publicly at scale.

---

## Teardown

```bash
sam delete
```

Removes the entire stack — Lambda functions, API Gateway, DynamoDB table —
in one command. The frontend (if on GitHub Pages) is removed separately by
deleting that repo or disabling Pages in its settings.

---

## License

MIT — do whatever you want with this.