This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create `gsc-analyst/.env.local` and set:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
# /api/auth/google/callback を推奨
# 既存の /api/auth/gsc/callback でも後方互換で動作します
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
# Optional (default: webmasters.readonly + analytics.readonly)
# GOOGLE_OAUTH_SCOPES="https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly"

# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# Optional (default: gsc_oauth_tokens)
# GOOGLE_OAUTH_TOKEN_TABLE=gsc_oauth_tokens

ANTHROPIC_API_KEY=...
# Optional
# ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Features

- Google OAuth (single connection)
- MCP-style analytics tools (GSC / GA4)
- AI agent that selects tools from prompt intent
- Unified chat UI (no provider selector)

## API Routes

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/sites` (GSC site list)
- `GET /api/ga4/properties` (GA4 property list)
- `POST /api/chat` (`message` only, tool selection is automatic)
