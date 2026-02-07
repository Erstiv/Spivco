# Project Spiv

## Overview

Project Spiv is a web content extraction tool — a "web scraper" with a noir/spy aesthetic. Users paste a URL, and the app uses a four-layer extraction strategy to fetch and clean page content. Think of it as a read-it-later / paywall-bypass style reader.

### Extraction Pipeline (4 strategies, in order):
1. **Front Door** — Browser impersonation via `got-scraping` (TLS fingerprint spoofing) + Googlebot UA fallback + social media bot UA fallback (facebookexternalhit, Slackbot). The social bot UAs bypass Cloudflare on many sites (e.g. Politico) because sites whitelist them for link preview generation.
2. **The Mercenary** — Jina.ai reader proxy (`r.jina.ai`) handles headless browsing remotely, returns clean Markdown. Bypasses paywalls and JS-rendered sites.
3. **Heavy Hitter (The Tank)** — Headless Chromium browser via Playwright with anti-automation detection bypass, renders JavaScript, waits for Cloudflare challenges, strips paywalls from live DOM
4. **The Archive** — Wayback Machine archive lookup via Internet Archive API (last resort)

The project is a full-stack TypeScript application with a React frontend and Express backend, originally inspired by a Python/Flask prototype (included in `attached_assets/`).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **Styling**: Tailwind CSS v4 with CSS variables for theming, using a custom "noir/paper" color palette (cream backgrounds, ink-black text, rust accents)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Fonts**: Special Elite (gritty typewriter for display) and Courier Prime (clean monospace) via Google Fonts
- **Animations**: Framer Motion for UI transitions
- **State Management**: TanStack React Query for server state; local React state for form/UI state
- **Build Tool**: Vite with React plugin, Tailwind CSS plugin, and custom Replit plugins

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript, executed via `tsx`
- **Core Feature**: A single `POST /api/fetch` endpoint that:
  1. Accepts a URL
  2. Fetches the page using spoofed Googlebot headers
  3. Parses HTML with Cheerio to extract article content
  4. Returns cleaned text/title/source to the frontend
- **Request timeout**: 15 seconds via AbortController

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM (configured in `drizzle.config.ts`)
- **Schema**: Defined in `shared/schema.ts` — currently just a `users` table with id, username, password
- **Current Storage**: `MemStorage` (in-memory Map) is the active implementation in `server/storage.ts`. The database schema exists but isn't actively wired to the main feature yet.
- **Session Store**: `connect-pg-simple` is listed as a dependency for PostgreSQL-backed sessions

### Project Structure
```
client/           → React frontend (Vite)
  src/
    components/ui/  → shadcn/ui components
    pages/          → Route pages (home, not-found)
    hooks/          → Custom React hooks
    lib/            → Utilities (queryClient, cn helper)
server/           → Express backend
  index.ts        → Server entry point, middleware setup
  routes.ts       → API routes (the /api/fetch endpoint)
  storage.ts      → Storage interface and in-memory implementation
  static.ts       → Static file serving for production
  vite.ts         → Vite dev server middleware integration
shared/           → Code shared between client and server
  schema.ts       → Drizzle ORM schema + Zod validation
script/           → Build scripts
  build.ts        → Production build (Vite for client, esbuild for server)
migrations/       → Drizzle database migrations
```

### Build & Development
- **Dev mode**: `npm run dev` starts the Express server with Vite middleware for HMR
- **Production build**: `npm run build` builds client with Vite and bundles server with esbuild into `dist/`
- **Production start**: `npm start` runs the bundled server from `dist/index.cjs`
- **Database migrations**: `npm run db:push` uses drizzle-kit to push schema changes

### Key Design Decisions
- **Monorepo structure**: Client and server share TypeScript config and the `shared/` directory for type-safe schema sharing
- **In-memory storage as default**: The storage layer uses an interface (`IStorage`) pattern, making it easy to swap `MemStorage` for a database-backed implementation
- **Cheerio for HTML parsing**: Server-side HTML extraction avoids needing a headless browser, keeping the app lightweight
- **Spoofed headers**: The fetch endpoint uses Googlebot User-Agent and Google Referer headers to bypass basic access restrictions

## External Dependencies

### Database
- **PostgreSQL**: Required for Drizzle ORM. Connection string via `DATABASE_URL` environment variable.

### Key NPM Packages
- **cheerio**: Server-side HTML parsing and content extraction
- **drizzle-orm** + **drizzle-kit**: Database ORM and migration tooling
- **express**: HTTP server framework
- **framer-motion**: Frontend animations
- **@tanstack/react-query**: Async data fetching/caching on the frontend
- **wouter**: Client-side routing
- **zod** + **drizzle-zod**: Schema validation

### External Services
- No third-party APIs are currently integrated
- Google Fonts CDN for typeface loading (Special Elite, Courier Prime)