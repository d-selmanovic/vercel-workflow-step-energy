# AGENTS.md

Regeln und Kommandos für alle Agents und Contributor in diesem Repository.

## Stack

- TypeScript (ESM, `type: "module"`), Node-Laufzeit
- **Vercel Workflow SDK** (`workflow` v4, `"use workflow"` / `"use step"`) auf **Nitro** v3
- Express 5 in `src/index.ts` (HTTP-Endpunkte, starten Workflows)

## Setup

Vor dem ersten Run: `cp .env.example .env` und ausfüllen (Anleitung: `docs/env-setup.md`).

## Kommandos

| Zweck | Befehl |
|---|---|
| Dev-Server | `npm run dev` → http://localhost:3000 |
| Workflow triggern | `curl -X POST --json '{"email":"hello@example.com"}' http://localhost:3000/api/signup` |
| Runs & Steps (Web-UI) | `npx workflow web` → http://localhost:1744 |
| Runs & Steps (Terminal) | `npx workflow inspect runs` |
| Build | `npm run build` |

Vor Deploy: **Fluid Compute aktivieren** (siehe README), sonst zahlt jeder Workflow-Resume einen Cold Start.

## Konventionen

- Workflow-Funktionen in `workflows/*.ts` (keine `"use workflow"`-Funktionen in `src/index.ts`).
- Externe Aufrufe, I/O und alles Fehleranfällige gehören in `"use step"`-Funktionen — nur Steps werden mit Retry neu ausgeführt.
- Kein Retry bei nicht behebbaren Fehlern: `throw new FatalError(...)` aus `workflow`.
- HTTP-Endpunkte in `src/index.ts` bleiben dünn: Body validieren, `start(workflowFn, [args])` aufrufen, sofort antworten.
- n8n-Konventionen → SDK-Entsprechungen: README-Tabelle (HTTP Request → Step mit `fetch`, Wait → `sleep`, IF/Switch → normale `if`/`switch`).

## Produktkontext

Hintergrund und Migrationsstand aus n8n: `docs/project.md` (Referenz, keine Anleitung).
