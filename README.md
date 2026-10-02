# Vercel Workflows

Langlebige Workflows als TypeScript-Code mit der [Vercel Workflow SDK](https://workflow-sdk.dev) –
als Grundlage, um Workloads aus n8n nach Code zu übertragen.

## Setup

```bash
npm install
cp .env.example .env   # ausfüllen, Anleitung: docs/env-setup.md
npm run dev            # Dev-Server auf http://localhost:3000
```

## Workflow triggern

```bash
curl -X POST --json '{"email":"hello@example.com"}' http://localhost:3000/api/signup
```

## Observability (Runs & Steps beobachten)

Zwei Wege, dieselben Daten:

**Web-UI** – grafische Ansicht, Steps anklickbar, Fehler und Retries sichtbar:

```bash
# in einem zweiten Terminal, während `npm run dev` läuft:
npx workflow web
```

Öffnet `http://localhost:1744` (Port wird beim Start angezeigt). Dort findest du
die Runs, kannst in jeden reinzoomen und die einzelnen Steps mit Ein-/Ausgaben
und Retry-Historie sehen.

**Terminal** – schneller Check ohne Browser:

```bash
npx workflow inspect runs
```

## Projektstruktur

- `workflows/` – Workflow-Funktionen (`"use workflow"`) und Steps (`"use step"`)
- `src/index.ts` – Express-App mit Endpunkten, die Workflows starten
- `nitro.config.ts` – Nitro-Build mit `workflow/nitro`-Modul (kompiliert Workflows)

## n8n → Vercel Workflow SDK: Entsprechungen

| n8n | Workflow SDK |
|---|---|
| HTTP Request Node | `fetch` in einem `"use step"` |
| Wait / Delay Node | `sleep("5s")` im Workflow (Durable, verbraucht keine Ressourcen) |
| Schedule Trigger | Vercel Cron Job → Endpoint → `start()` |
| Retry on Fail | Standardverhalten von Steps (`FatalError` = kein Retry) |
| Set / Code Node | Einfach TypeScript im Step oder Workflow |
| Webhook Trigger | Express-Route, die `start()` aufruft |
| IF / Switch | Normale `if`/`switch` im Workflow-Code |

## Deployment (später)

Workflow-SDK-Apps laufen am besten auf Vercel. Vor dem Deploy **Fluid Compute aktivieren**,
sonst zahlt jeder Workflow-Resume für einen eigenen Cold Start.
