# Voice Shopping Assistant

A voice-enabled shopping assistant MVP built with Next.js (App Router), TypeScript, and Tailwind CSS. Uses a local vector-based knowledge base with Gemini AI for semantic product search.

## Features

- 🎤 **Voice Input**: Speak to search for products (Chrome/Edge recommended)
- 🤖 **AI-Powered**: Gemini converts natural language to semantic search
- 🧠 **Knowledge Base**: Local vector store with LanceDB for fast semantic search
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
│                      Synonyms           (LanceDB)              │
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

## Product Sync

Products are synced from Shopify Admin API to a local vector store. This needs to be done:
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
│   └── sync/
│       └── route.ts        # Sync trigger endpoint
components/
├── Chat.tsx                # Chat message display
├── VoiceInput.tsx          # Voice recording component
└── ProductGrid.tsx         # Product cards grid
lib/
├── types.ts                # TypeScript interfaces
├── gemini.ts               # Gemini AI integration
├── embeddings.ts           # Gemini embeddings
├── productEnricher.ts      # Smart tagging (Gemini + rules)
├── vectorStore.ts          # LanceDB wrapper
├── knowledgeBase.ts        # Orchestration layer
├── shopify.ts              # Legacy Storefront API (unused)
└── shopifyAdmin.ts         # Admin API client
scripts/
└── sync-products.ts        # CLI sync script
data/
└── products.lance/         # LanceDB vector store (auto-created)
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
- Check the data/products.lance/ directory exists
- Try simpler queries

### Gemini errors / Rate limits
- The app automatically falls back to simpler models
- Consider batching for large catalogs
- Check Google AI Studio quotas

### Voice not working
- Voice input requires HTTPS in production (localhost is exempt)
- Use Chrome, Edge, or Safari
- Check browser microphone permissions

## License

MIT
