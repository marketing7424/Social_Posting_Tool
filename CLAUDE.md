# Social Posting Tool

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

## Project Overview

A multi-platform social media management tool for **Facebook**, **Instagram**, and **Google Business Profile**. Supports scheduled posting, AI content generation, analytics, and multi-account management.

## Tech Stack

- **Python 3.10+** — Primary language
- **Claude API** — Content generation (via `anthropic` SDK)
- **Meta Graph API** — Facebook + Instagram (single API handles both)
- **Google Business Profile API** — Google posts
- **SQLite** — Local scheduling database & account management
- **APScheduler** — Post scheduling engine

## Architecture: Claude Skills

**Layer 1: Skills (Intent + Execution bundled)**
- Live in `.claude/skills/`
- Each Skill = `SKILL.md` instructions + `scripts/` folder
- Claude auto-discovers and invokes based on task context

**Layer 2: Orchestration (Decision making)**
- Claude reads SKILL.md, runs bundled scripts in the right order
- Handles errors, asks for clarification, updates Skills with learnings

**Layer 3: Shared Utilities**
- Common scripts in `execution/` (auth, API clients, database)
- Used across multiple Skills when needed

## Planned Skills

### Content & Publishing
- `create-post` — Generate platform-optimized content using Claude API. Text, hashtags, image captions. Adapts tone/format per platform (short for Instagram, detailed for Facebook, local-SEO for Google).
- `schedule-post` — Queue posts for future publishing. Manages the SQLite schedule database and APScheduler jobs.
- `publish-post` — Execute publishing to Facebook, Instagram, and/or Google Business Profile via their APIs.
- `bulk-schedule` — Import a CSV/spreadsheet of posts and schedule them all at once.

### Analytics & Reporting
- `analytics` — Pull engagement metrics (reach, likes, comments, shares) from all platforms. Aggregate into a unified dashboard view.
- `best-times` — Analyze historical engagement data to recommend optimal posting times per platform.

### Account Management
- `manage-accounts` — Add, remove, and switch between Facebook Pages, Instagram Business accounts, and Google Business Profiles.
- `auth-setup` — Guide OAuth flows for Meta and Google. Store tokens securely.

### Media
- `media-upload` — Handle image/video uploads with platform-specific formatting (aspect ratios, size limits, thumbnails).

## API Integration Details

### Meta Graph API (Facebook + Instagram)
- **Auth**: OAuth 2.0 via Facebook Login → long-lived Page Access Token
- **Facebook Pages**: `POST /{page-id}/feed` for posts, `/{page-id}/photos` for images
- **Instagram**: Requires Facebook Page linked to Instagram Business account. Two-step: create media container → publish
- **Permissions needed**: `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`
- **Rate limits**: 200 calls/user/hour (Graph API), respect and handle gracefully

### Google Business Profile API
- **Auth**: OAuth 2.0 via Google Cloud project
- **Posts**: `POST accounts/{account}/locations/{location}/localPosts`
- **Post types**: What's New, Event, Offer
- **Requires**: Google Business Profile linked to a verified location

### Claude API (Content Generation)
- **Auth**: `ANTHROPIC_API_KEY` in `.env`
- **Model**: Use `claude-sonnet-4-6` for content generation (fast + cheap)
- **Use for**: Writing post copy, suggesting hashtags, adapting content per platform, generating image captions

## File Organization

```
Social Posting Tool/
├── .claude/skills/          # Skills (SKILL.md + scripts/)
├── .env                     # API keys and secrets (never commit)
├── .env.example             # Template for required env vars
├── execution/               # Shared utilities (auth, db, API clients)
├── .tmp/                    # Intermediate files (never commit)
├── data/                    # SQLite database, local state
└── CLAUDE.md                # This file
```

**Key principle:** Local files are only for processing and state. Published content lives on the platforms.

## Environment Variables

Required in `.env`:
```
ANTHROPIC_API_KEY=           # Claude API for content generation
META_APP_ID=                 # Meta Developer App ID
META_APP_SECRET=             # Meta Developer App Secret
GOOGLE_CLIENT_ID=            # Google OAuth Client ID
GOOGLE_CLIENT_SECRET=        # Google OAuth Client Secret
```

## Operating Principles

1. **Skills auto-activate** — Claude picks the right Skill based on your request.
2. **Scripts are bundled** — Each Skill has its own `scripts/` folder.
3. **Self-anneal when things break** — Fix the script, test it, update SKILL.md with what was learned.
4. **Don't create new Skills without asking** — Update existing ones first.
5. **Respect rate limits** — All API calls must handle rate limiting gracefully with exponential backoff.
6. **Multi-account first** — Every feature must support multiple accounts from day one.
