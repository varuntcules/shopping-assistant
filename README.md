# Voice Shopping Assistant

A voice-enabled shopping assistant MVP built with Next.js (App Router), TypeScript, and Tailwind CSS. Uses a Postgres+pgvector-based knowledge base (e.g., Supabase) with Gemini AI for semantic product search.

## Features

- 🎤 **Voice Input**: Speak to search for products (Chrome/Edge recommended)
- 🔊 **Text-to-Speech**: Natural-sounding voice responses with product recommendations (ElevenLabs)
- 🤖 **AI-Powered**: Gemini converts natural language to semantic search
- 🧠 **Knowledge Base**: Hosted vector store backed by Postgres+pgvector (e.g., Supabase)
- 🏷️ **Smart Tagging**: Gemini-generated tags + rule-based synonyms and price tiers
- 🛒 **Shopify Integration**: Syncs products from Shopify Admin API
- 🎯 **Smart Fallbacks**: Never crashes - gracefully handles API failures
- 🌙 **Beautiful UI**: Modern dark theme with glassmorphism effects

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Daily Sync Process                          │
├─────────────────────────────────────────────────────────────────┤
│  Shopify Admin API  →  Tag Enricher  →  Gemini Embeddings      │
│         ↓                   ↓                   ↓              │
│    Fetch Products    Smart Tags +        Vector Store          │
│                      Synonyms         (Postgres+pgvector)      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Search Flow                                │
├─────────────────────────────────────────────────────────────────┤
│  User Query  →  Gemini Parse Intent  →  Query Embedding        │
│       ↓               ↓                      ↓                 │
│  "Show me         SearchIntent         Vector Similarity       │
│   sneakers"       + filters               Search               │
│                                              ↓                 │
│                                      Filtered Products         │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Shopify store with Admin API access
- Google AI Studio API key (Gemini)
- Hosted Postgres database with `pgvector` extension (e.g., Supabase)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd shopping-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```env
# Gemini AI
GEMINI_API_KEY="your_google_ai_studio_key"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_MODEL_FALLBACK="gemini-2.5-flash-lite"

# Shopify Admin API
SHOPIFY_STORE_DOMAIN="yourshop.myshopify.com"
SHOPIFY_ADMIN_API_TOKEN="shpat_your_admin_token"
SHOPIFY_ADMIN_API_VERSION="2025-10"

# Optional: Sync secret (leave empty for no auth)
SYNC_SECRET=""

# ElevenLabs TTS (optional - for voice responses)
ELEVENLABS_API_KEY="your_elevenlabs_api_key"
ELEVENLABS_VOICE_ID="21m00Tcm4TlvDq8ikWAM"  # Optional: default voice ID

# Database (Supabase or any Postgres+pgvector)
DATABASE_URL="postgres://user:password@host:5432/dbname"
DB_SSL="true"
```

4. Run the initial product sync:
```bash
npx tsx scripts/sync-products.ts
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ | - | Google AI Studio API key |
| `GEMINI_MODEL` | ❌ | `gemini-2.5-flash` | Primary Gemini model |
| `GEMINI_MODEL_FALLBACK` | ❌ | `gemini-2.5-flash-lite` | Fallback model |
| `SHOPIFY_STORE_DOMAIN` | ✅ | - | Your Shopify store domain |
| `SHOPIFY_ADMIN_API_TOKEN` | ✅ | - | Admin API access token |
| `SHOPIFY_ADMIN_API_VERSION` | ❌ | `2025-10` | Admin API version |
| `SYNC_SECRET` | ❌ | - | Optional secret for sync endpoint |
| `ELEVENLABS_API_KEY` | ❌ | - | ElevenLabs API key for text-to-speech (optional) |
| `ELEVENLABS_VOICE_ID` | ❌ | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice ID (optional) |
| `DATABASE_URL` | ✅ (prod) | - | Postgres connection string (Supabase or similar) |
| `DB_SSL` | ❌ | `true` | Set to `false` if your Postgres instance does not require SSL |

## Product Sync

Products are synced from Shopify Admin API to a hosted vector store in Postgres+pgvector. This needs to be done:
- Before first use
- Daily (or as needed when products change)

### Manual Sync (CLI)
```bash
npx tsx scripts/sync-products.ts
```

### Manual Sync (API)
```bash
curl -X POST http://localhost:3000/api/sync
```

### Check Sync Status
```bash
curl http://localhost:3000/api/sync
```

### Daily Cron Job
Add to your crontab (runs at 2 AM daily):
```bash
0 2 * * * cd /path/to/shopping-assistant && npx tsx scripts/sync-products.ts >> sync.log 2>&1
```

## Usage

### Voice Input
1. Click the microphone button
2. Speak your query (e.g., "Show me sneakers under 5000 rupees")
3. Click stop when done
4. The transcript will appear in the text box
5. Press Enter or click Send

### Text Input
1. Type your query in the text box
2. Press Enter or click Send

### Text-to-Speech (TTS)
1. Click the TTS toggle button in the header to enable voice responses
2. When enabled, assistant responses will automatically play as speech
3. Product recommendations are spoken with names and prices in INR (rupees)
4. TTS preference is saved and persists across page reloads

### Example Queries
- "Show me sneakers under 5000 rupees"
- "Find the latest smartphones"
- "Best selling t-shirts"
- "Cheap accessories under 1000"
- "Premium headphones"
- "Casual wear for daily use"

## Project Structure

```
app/
├── page.tsx                 # Main UI with chat interface
├── api/
│   ├── assistant/
│   │   └── route.ts        # Chat API (uses knowledge base)
│   ├── tts/
│   │   └── route.ts        # Text-to-speech API (ElevenLabs)
│   └── sync/
│       └── route.ts        # Sync trigger endpoint
components/
├── Chat.tsx                # Chat message display
├── VoiceInput.tsx          # Voice recording component
├── TTSToggle.tsx           # TTS enable/disable toggle
└── ProductGrid.tsx         # Product cards grid
lib/
├── types.ts                # TypeScript interfaces
├── gemini.ts               # Gemini AI integration
├── embeddings.ts           # Gemini embeddings
├── productEnricher.ts      # Smart tagging (Gemini + rules)
├── vectorStore.ts          # Postgres+pgvector wrapper
├── knowledgeBase.ts        # Orchestration layer
├── useTextToSpeech.ts      # TTS React hook
├── formatProductText.ts    # Format products for TTS
├── shopify.ts              # Legacy Storefront API (unused)
└── shopifyAdmin.ts         # Admin API client
scripts/
└── sync-products.ts        # CLI sync script
```

## How It Works

### Product Enrichment

Each product is enriched with:

**Gemini-generated tags:**
- Category refinements (casual wear, formal, sportswear)
- Style descriptors (minimalist, vintage, trendy)
- Occasion tags (wedding, daily wear, party)
- Material hints (cotton, leather, silk)

**Rule-based tags:**
- Price tiers: budget, affordable, mid-range, premium, luxury
- Synonyms: "t-shirt" → tee, tshirt, top
- Vendor normalization

### Semantic Search

1. User query is parsed by Gemini to extract intent
2. Query is converted to a 768-dim embedding
3. Vector similarity search finds matching products
4. Results are filtered by price/sort preferences
5. Products are returned with UI metadata

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Voice Input | ✅ | ❌ | ✅ | ✅ |
| Text Input | ✅ | ✅ | ✅ | ✅ |
| Product Display | ✅ | ✅ | ✅ | ✅ |

> **Note**: Voice input uses the Web Speech API which is primarily supported in Chromium-based browsers.

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Sync products
npx tsx scripts/sync-products.ts
```

## Troubleshooting

### "Knowledge base not initialized"
- Run the sync first: `npx tsx scripts/sync-products.ts`
- Or call POST `/api/sync`

### Sync fails with Admin API error
- Check that `SHOPIFY_ADMIN_API_TOKEN` is correct
- Verify the token has product read permissions
- Check `SHOPIFY_STORE_DOMAIN` format (no `https://`)

### No products returned
- Ensure sync completed successfully
- Try simpler queries

## Production Setup (Supabase example)

1. Create a Supabase project and obtain the **Postgres connection string**.
2. In the SQL editor, enable pgvector and create the `products` table:

```sql
create extension if not exists "vector";

create table if not exists products (
  id text primary key,
  title text not null,
  handle text not null,
  vendor text not null,
  product_type text not null,
  description text not null,
  price double precision not null,
  currency text not null,
  image_url text not null,
  image_alt text not null,
  all_tags text not null,
  price_tier text not null,
  embedding_text text not null,
  vector vector(768) not null
);
```

3. In your **Vercel project settings**, add:
   - `DATABASE_URL` = the Supabase Postgres connection string
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, and Shopify env vars from above

After this one-time setup, any commit merged to the main branch will deploy successfully on Vercel without additional configuration from collaborators.

### Gemini errors / Rate limits
- The app automatically falls back to simpler models
- Consider batching for large catalogs
- Check Google AI Studio quotas

### Voice not working
- Voice input requires HTTPS in production (localhost is exempt)
- Use Chrome, Edge, or Safari
- Check browser microphone permissions

### TTS not working
- Ensure `ELEVENLABS_API_KEY` is set in `.env.local`
- Check browser console for TTS API errors
- TTS will gracefully fail if API key is missing (chat still works)

## License

MIT
