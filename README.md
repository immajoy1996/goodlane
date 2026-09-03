# Goodlane Carrier Agent

AI assistant for freight brokers at Goodlane Logistics. It ingests inbound carrier email and phone communication, normalizes them into a queryable knowledge base, and answers operational questions through an LLM agent with deterministic tool calls.

Brokers can ask which carriers confirmed on a load, what the best current offer is, pull carrier compliance history, compare rates to lane benchmarks, and draft follow-up emails — all grounded in real interaction data, not model guesses.

## How to run

```bash
npm install
cp .env.example .env   # then fill in the Lambda URLs
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Click **Prepare Knowledge Base** before using the Agent tab.

Required env vars (see `.env.example`):

- `VITE_OPENAI_CHAT_URL` — chat / tool-calling Lambda
- `VITE_TRANSCRIBE_AUDIO_URL` — call transcription Lambda (optional until you process recordings)
- `VITE_ANALYSIS_MODEL` — optional; defaults to `gpt-4.1-mini`

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| UI | React 19 + TypeScript + Vite | Fast dev loop, type safety, static deploy |
| Components | Mantine | Polished tables, drawers, forms without custom CSS overhead |
| Knowledge store | sql.js (SQLite in WASM) | Structured queries over interactions/loads/carriers without a backend |
| LLM | OpenAI via AWS Lambda proxy | API keys stay server-side; browser only calls your endpoints |
| Transcription | AWS Lambda | Same pattern — audio never hits OpenAI directly from the client |
| Call cache | `localStorage` | Transcripts and analysis persist across refreshes |

No backend server is required for the app itself. The browser loads static data, builds an in-memory SQLite database on demand, and calls Lambda for AI workloads.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React UI                                │
│  Agent │ Unified │ Calls │ Emails                               │
└────────────┬───────────────────────────────┬──────────────────┘
             │                               │
             ▼                               ▼
   ┌──────────────────┐          ┌─────────────────────┐
   │  runAgent()      │          │  initializeKnowledge│
   │  tool loop       │          │  Base()             │
   └────────┬─────────┘          └──────────┬──────────┘
            │                               │
            ▼                               ▼
   ┌──────────────────┐          ┌─────────────────────┐
   │  executeTool()   │          │  emails + calls →   │
   │  retrieval.ts    │◄─────────│  CarrierInteraction │
   └────────┬─────────┘          │  → SQLite tables    │
            │                      └─────────────────────┘
            ▼
   ┌──────────────────┐
   │  sql.js (WASM)   │
   │  interactions    │
   │  loads           │
   │  carriers        │
   │  rate_history    │
   └──────────────────┘
```

### Ingestion pipeline

When the user clicks **Prepare Knowledge Base**:

1. **Emails** — 274 records from `carrier_emails.json` are adapted via `emailToInteraction()`
2. **Calls** — 55 WAV files are discovered, transcribed (Lambda), analyzed (Lambda), then adapted via `callToInteraction()`. Transcripts and analysis are cached in `localStorage` so re-prepare is fast.
3. **Reference data** — `loads.csv`, `carrier_profiles.json`, and `rate_history.csv` are loaded into SQLite
4. **Overrides** — any manual load/MC assignments from the review UI are applied from `localStorage`
5. **Sanity checks** — verifies interaction counts, no duplicate IDs, reference tables populated

The agent is blocked until this step completes. Calls and Emails tabs work independently without the knowledge base.

### Agent loop

```
User question
    → postChatCompletion (Lambda, tools enabled)
    → model returns tool_call(s)
    → executeTool() runs locally against SQLite
    → tool results sent back to model
    → repeat (max 5 rounds)
    → final natural-language answer
```

Business logic lives in TypeScript. The LLM decides *which* tool to call and how to phrase the answer — it does not compute rates, group carriers, or query raw JSON directly.

## Data model

### CarrierInteraction

The normalized unit for both email and call. Every inbound message becomes one interaction:

```typescript
{
  id: "email:CE0042" | "call:call_003_rate_negotiation",
  source: "email" | "call",
  loadId, mcNumber, carrierName,
  availability, carrierRate, brokerRate, agreedRate,
  equipment, questions, timestamp, rawText,
  loadIdConfidence, mcNumberConfidence,  // high | medium | low
  needsReview, manuallyAssigned
}
```

**Design decisions:**

- **Raw text preserved** — `rawText` always keeps the original email body or call transcript. Structured fields are extracted, not substituted.
- **Three rate fields, never collapsed** — broker rate (what Goodlane offered), carrier rate (carrier's ask), agreed rate (explicit acceptance). The agent system prompt enforces this distinction.
- **MC number preferred over name** for grouping — conversations key on `loadId + mcNumber` when available, falling back to carrier name only when MC is missing.
- **Confidence flags** — load IDs and MC numbers from messy sources (garbled calls, conflicting emails) get `high` / `medium` / `low` confidence. Low-confidence interactions surface in the Unified tab's review panel for manual assignment.

### Conversation

Interactions grouped by load + carrier, with derived **current state** computed oldest → newest:

- Latest availability wins
- Latest carrier ask updates `currentRate`
- An explicit `agreedRate` sets status to `confirmed` and overrides prior asks
- Open questions accumulate across the timeline

This gives brokers a single cross-channel view: a carrier might email availability, then call to negotiate rate — both appear in one conversation with the latest state on top.

## SQLite knowledge base

Built in-browser with sql.js (SQLite compiled to WASM). Rebuilt each session when the user prepares the knowledge base — it is not persisted to disk.

| Table | Source | Used for |
|-------|--------|----------|
| `interactions` | emails + analyzed calls | Load/carrier state, agent queries |
| `loads` | `loads.csv` | Route, equipment, offered rate, shipper |
| `carriers` | `carrier_profiles.json` | Reliability, compliance, history |
| `rate_history` | `rate_history.csv` | Lane market benchmarks |

**Why SQLite instead of querying JSON at runtime:**

- Agent tools map to SQL queries — predictable, testable, fast
- Joins across interactions, loads, and carriers without ad-hoc indexing
- Schema enforces types; retrieval functions return typed results
- At production scale this layer would move to Postgres/DynamoDB with the same query interface

**Why in-memory, not persisted:**

- Dataset is small (~330 interactions, 50 loads, 48 carriers)
- Simplifies deployment (static site, no database server)
- Call transcripts/analysis *are* persisted in `localStorage` since transcription is expensive

## Agent tools

Five tools, all backed by `retrieval.ts` → SQLite:

| Tool | Purpose |
|------|---------|
| `get_load_interactions` | All carrier states for a load — availability, rates, source IDs |
| `get_load_details` | Load board facts — lane, pickup, equipment, offered rate |
| `get_carrier_history` | CRM/compliance — reliability, authority, insurance, prior loads |
| `find_carrier` | Resolve ambiguous carrier references by name, email, or MC |
| `get_rate_context` | Recent lane rate benchmarks from `rate_history.csv` |

`find_carrier` exists because brokers ask "tell me about Pinnacle Freight" not "tell me about MC 107654". The agent is instructed to resolve identity first, then pull history.

Tool results are shown in the Agent tab's activity trace so brokers can see what data backed the answer.

## Entity resolution

Real broker data is messy — garbled MC numbers on calls, conflicting load references in emails, missing fields. The app handles this with:

1. **Automatic confidence scoring** — compares extracted IDs against known loads (`loads.csv`) and carriers (`carrier_profiles.json`) using exact match, digit similarity, and name fuzzy matching
2. **Review queue** — low-confidence interactions appear in the Unified tab for manual assignment
3. **Suggested matches** — shows closest load/carrier candidates with scores while the user decides
4. **Persistent overrides** — manual assignments saved to `localStorage` and reapplied on next knowledge base prepare

## UI

| Tab | Purpose |
|-----|---------|
| **Agent** | Chat with tool-calling agent. Requires prepared knowledge base. |
| **Unified** | Cross-channel conversations, review queue, confidence badges |
| **Call Recordings** | Transcribe/analyze calls, browse by thread |
| **Carrier Emails** | Email threads with search and filters |

Tab state persists while switching (components stay mounted, hidden with CSS) so agent chat history is not lost.

## Quick start

```bash
npm install
cp .env.example .env
# Add your Lambda URLs to .env
npm run dev
```

Open the app → click **Prepare Knowledge Base** on the Agent tab → wait for emails + calls to process → start asking questions.

```bash
npm run build   # production build → dist/
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_OPENAI_CHAT_URL` | Lambda proxy for OpenAI chat (agent + call analysis) |
| `VITE_TRANSCRIBE_AUDIO_URL` | Lambda for audio transcription |
| `VITE_ANALYSIS_MODEL` | Model name (default: `gpt-4.1-mini`) |

Do not put OpenAI API keys in the frontend. Lambda holds the secret.

## Project structure

```
src/
├── agent/
│   ├── runAgent.ts          # Tool-calling loop (max 5 rounds)
│   └── tools.ts             # Tool schemas + executeTool()
├── components/
│   ├── agent/               # Chat UI
│   ├── calls/               # Call transcription + analysis
│   ├── carrier-conversations/
│   └── unified/             # Cross-channel view + review panel
├── data/
│   ├── initializeKnowledgeBase.ts
│   └── supportingData.ts    # CSV loaders
├── db/
│   └── knowledgeDb.ts       # SQLite schema + queries
├── services/
│   ├── conversations.ts     # Adapters, grouping, current state
│   ├── retrieval.ts           # Agent-facing query functions
│   ├── entityResolution.ts    # Confidence scoring + fuzzy match
│   ├── callAnalysis.ts        # Structured extraction from transcripts
│   └── callStorage.ts         # localStorage cache for calls
└── types/
    └── interactions.ts        # CarrierInteraction, Conversation
```

## Key design tradeoffs

**Deterministic retrieval over vector search** — queries map to structured IDs (load ID, MC number). The dataset is small enough that SQL is simpler and more reliable than embeddings for operational questions.

**LLM for language, TypeScript for logic** — the model handles intent, drafting, and natural-language answers. Grouping, rate semantics, sorting, state derivation, and database lookups are all explicit code.

**Lambda proxy for AI** — keeps secrets off the client and avoids CORS issues with OpenAI directly. Tradeoff: requires AWS setup before the agent works.

**Parallel call processing** — 4 concurrent transcriptions during knowledge base prepare. Cached results skip re-transcription on refresh.

## Data

See `data/README.md` for dataset details. Summary:

- 274 carrier emails, 55 call recordings, 50 loads, 48 carrier profiles, 720 rate history rows
- Intentionally messy: missing MC numbers, garbled spoken IDs, conflicting load references, blank weights

## License

Private — Goodlane Logistics.
