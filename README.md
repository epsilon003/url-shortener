# Link Ticket Co. — Serverless URL Shortener

A fully serverless URL shortener on AWS — paste a long URL, get back a short
one, redirect at scale, pay nothing. Built to run entirely within AWS's
Always Free tier, with real per-user login via Amazon Cognito.

**Live demo:** _add your GitHub Pages URL here once deployed_

---

## Stack

| Layer | Service | Why |
|---|---|---|
| API | Amazon API Gateway (HTTP API) | Routing, throttling, CORS, JWT auth |
| Auth | Amazon Cognito | Real per-user login, no shared secrets |
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
                     ┌──────────────────┐
  Browser  ───POST──▶│  API Gateway     │──── validates JWT via
 (frontend)          │  (HTTP API)      │     Cognito JWT authorizer
                     └────────┬─────────┘     (on /shorten only)
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        ┌───────────────┐         ┌────────────────┐
        │ShortenFunction │         │RedirectFunction │
        │   (Lambda)     │         │   (Lambda)      │
        │  auth required │         │  public, no auth │
        └───────┬────────┘         └───────┬─────────┘
                 │                          │
                 └───────────┬──────────────┘
                              ▼
                     ┌─────────────────┐
                     │   DynamoDB       │
                     │  (UrlTable)      │
                     └─────────────────┘

  Sign-in flow: Browser → Cognito Hosted UI → redirect back with
  id_token → sent as "Authorization: Bearer <token>" on POST /shorten
```

`POST /shorten` → requires a valid Cognito ID token → `ShortenFunction`
generates a 6-character code, writes `{code, url, clicks, createdAt}` to
DynamoDB, returns the short URL.

`GET /{code}` → no auth required → `RedirectFunction` looks up the code,
increments a click counter (fire-and-forget), and responds with a `301`
redirect to the original URL. This route is deliberately public: short
links need to be clickable by anyone, not just the account holder.

---

## Project structure

```
url-shortener/
├── template.yaml           # SAM/CloudFormation stack: API, Lambdas, DynamoDB, Cognito
├── SETUP_GUIDE.md          # full beginner walkthrough, start to finish
├── src/
│   ├── shorten/
│   │   ├── index.js        # POST /shorten handler
│   │   └── package.json
│   └── redirect/
│       ├── index.js        # GET /{code} handler
│       └── package.json
└── frontend/
    └── index.html          # ticket-themed UI with Cognito sign-in, deploy anywhere static
```

---

## Quick start

Full walkthrough (AWS account setup, IAM, Cognito user creation, CLI
installation) is in [`SETUP_GUIDE.md`](./SETUP_GUIDE.md). Short version if
you already have AWS CLI + SAM CLI configured:

```bash
sam build
sam deploy --guided
```

You'll be prompted for `CognitoDomainPrefix` (must be globally unique) and
`FrontendCallbackUrl`. After deploying, create yourself a Cognito user (see
`SETUP_GUIDE.md` Part 7.5), fetch a token, and test:

```bash
curl -X POST "$ApiURL/shorten" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IdToken" \
  -d '{"url": "https://example.com"}'
```

...or point `frontend/index.html`'s config constants at your deployment and
host the page anywhere static (GitHub Pages, Cloudflare Pages, etc) — it
handles the Cognito login redirect for you.

---

## API reference

### `POST /shorten`

Requires `Authorization: Bearer <id_token>`, validated by API Gateway's
native JWT authorizer against your Cognito user pool — no custom auth code
to maintain.

**Request:**
```
POST /shorten
Content-Type: application/json
Authorization: Bearer eyJraWQiOi...

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

**Response `401`** — missing, expired, or invalid token.

### `GET /{code}`

**No auth required** — redirects must stay publicly clickable. Returns
`301` with a `Location` header pointing at the original URL, or `404` if
the code doesn't exist.

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
- Cognito: 50,000 monthly active users free, indefinitely

A budget alert is recommended (see `SETUP_GUIDE.md`, Part 2) so you're
notified the instant anything would bill.

---

## Security notes

- IAM permissions are scoped per-function via SAM policy templates
  (`DynamoDBReadPolicy` / `DynamoDBWritePolicy`) — each Lambda can only
  touch the one table it needs, nothing else in the account.
- `POST /shorten` requires a valid Cognito-issued JWT, checked natively by
  API Gateway (no custom Lambda authorizer to maintain, no static secret
  living in the frontend's page source). Tokens expire after 1 hour by
  default.
- Public self-signup is disabled on the Cognito user pool
  (`AllowAdminCreateUserOnly: true`) — only you can create accounts, via
  `aws cognito-idp admin-create-user`. This keeps the tool single-user by
  default; remove that setting if you want others to be able to sign up.
- CORS on the API is currently open (`AllowOrigins: "*"`) for ease of setup —
  tighten this to your actual frontend domain before treating this as
  production (see `SETUP_GUIDE.md`, Part 12.5).
- `GET /{code}` intentionally has no auth — short links need to be publicly
  clickable by anyone, not just the account holder.

---

## Teardown

```bash
sam delete
```

Removes the entire stack — Lambda functions, API Gateway, DynamoDB table,
Cognito user pool — in one command. The frontend (if on GitHub Pages) is
removed separately by deleting that repo or disabling Pages in its settings.

---

## License

MIT — do whatever you want with this.