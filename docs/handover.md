# Handover: Energy → Vercel Workflows

> **Stand:** 2026-10-02
> **Von Session:** Workflow-Bau-Planung (n8n → Vercel Migration)
> **Für Session:** Workflow-Implementierung
> **Zuerst lesen:** `docs/project.md` (einzige Quelle der Wahrheit, alle Details)
> **Diese Datei:** kompakter Einstieg + klare TODO-Liste für den nächsten Agent

---

## Ziel in einem Satz

Die 5 n8n-Workflows (F1–F5) eines automatischen Outbound-Callcenters zu **einem** Vercel Workflow SDK Workflow in TypeScript migrieren — mit LiveKit als Voice-Agent, Close.com als CRM, Cal.com für Termine und Vercel KV für Locks.

---

## Was ist fertig (nicht nochmal machen!)

| Was | Detail |
|---|---|
| n8n-Analyse | F1–F5 vollständig analysiert → `docs/n8n-analysis.md` |
| Ablauf-Beschreibung | Geschrieben + vom User bestätigt |
| Alle Architektur-Fragen | 6 Entscheidungen final getroffen (siehe `docs/project.md` Abschnitt 2) |
| Close.com Zugriff | MCP verbunden, 68 Tools, verifiziert (Org: Step2Job) |
| Cal.com Zugriff | API-Key verifiziert, User-ID: 2437916 |
| Cal.com Event-Type | „Energy Erstgespräch" angelegt, ID: 7312892, 20 Min |
| 7 Custom Fields | In Close angelegt (siehe `docs/project.md` Abschnitt 4) |
| `.env.example` | Vollständig mit Platzhaltern und Beschreibungen |
| `docs/env-setup.md` | Anleitung zum Befüllen der `.env` |
| Demo-Workflow | `workflows/user-signup.ts` läuft als Referenz |
| Dev-Setup | `npm run dev` funktioniert, Web-UI auch |

---

## Was muss der User noch liefern

Bevor der Workflow gebaut werden kann, brauchen wir diese Werte:

| Variable | Woher | Pflicht |
|---|---|---|
| `CLOSE_USER_ID` | Close → Settings → Team Management → User-ID kopieren | ✅ |
| `LIVEKIT_URL` | Aus n8n Workflow F2 (Dispatcher Outbound) kopieren | ✅ |
| `LIVEKIT_API_KEY` | Aus n8n Workflow F2 kopieren | ✅ |
| `LIVEKIT_API_SECRET` | Aus n8n Workflow F2 kopieren | ✅ |
| `LIVEKIT_AGENT_ID` | LiveKit Dashboard → Agents | ✅ |
| `LIVEKIT_WEBHOOK_SECRET` | LiveKit Dashboard → Settings → Webhooks | ✅ |
| `CALLER_ID` | Telefonnummer im E.164-Format (z.B. +4930123456) | ✅ |
| `KV_REST_API_URL` | Vercel Dashboard → Storage → KV → Connect | ✅ |
| `KV_REST_API_TOKEN` | Vercel Dashboard → Storage → KV → Connect | ✅ |
| `AGENT_WEBHOOK_SECRET` | Selbst erzeugen (z.B. `openssl rand -hex 32`) | ✅ |

> Sobald diese Werte da sind: `.env` aus `.env.example` kopieren, ausfüllen, weiter bauen.

---

## Was der nächste Agent bauen muss

### Datei 1: `workflows/energy.ts`

Der gesamte Workflow. Steps (alle in einer `"use workflow"` Funktion):

```
energyWorkflow(leadId)
│
├─ dispatch          → Jede Minute per Cron, wählt Lead, reserviert (KV), startet LiveKit-Anruf
├─ getKunde          → Lead-Daten für den Voice-Agent liefern
├─ getTermine        → Freie Slots von Cal.com holen
├─ bookTermin        → Termin in Cal.com buchen
├─ callResult        → Ergebnis vom Voice-Agent verarbeiten
├─ roomFinished      → LiveKit-Webhook: Gespräch beendet, aufräumen
└─ errorHandler      → Global: Close Activity + Task an Denis
```

**Wichtige Regeln (aus `AGENTS.md`):**
- Jeder externe Aufruf (Close API, Cal.com API, LiveKit API, KV) → eigener `"use step"`
- Nur Steps werden retried — deshalb kein I/O außerhalb von Steps
- `FatalError` werfen wenn nicht behebbar (z.B. Auth-Fehler)
- Keine `"use workflow"` Funktionen in `src/index.ts`

### Datei 2: `src/index.ts`

Dünne Express-Endpunkte, die `start()` aufrufen:

| Endpunkt | Methode | Body → Workflow |
|---|---|---|
| `/api/dispatch` | POST | `{}` → `dispatch()` |
| `/agent/get-kunde` | POST | `{ call_id }` → `getKunde()` |
| `/agent/get-termine` | POST | `{ datum }` → `getTermine()` |
| `/agent/book-termin` | POST | `{ lead_id, slot_start, dauer }` → `bookTermin()` |
| `/agent/call-result` | POST | `{ lead_id, outcome, do_not_call }` → `callResult()` |
| `/webhooks/livekit` | POST | LiveKit Webhook → `roomFinished()` |

**Auth:**
- `/agent/*` → `AGENT_WEBHOOK_SECRET` im Header prüfen
- `/webhooks/livekit` → JWT + SHA256 Validierung mit `LIVEKIT_WEBHOOK_SECRET`

### Vercel Cron

Dispatcher muss jede Minute laufen:
```json
// vercel.json
{
  "crons": [{ "path": "/api/dispatch", "schedule": "* * * * *" }]
}
```

---

## Ablauf im Detail

### Dispatcher (jede Minute)

```
1. Reconciliation: verwaiste Anrufe (dialing/active) → ended
2. Lead wählen: call_status = ready ODER (retry UND hold_until < now)
3. Prüfen: call_attempts < MAX_ATTEMPTS_PER_DAY UND Zeit im Anruffenster
4. Atomar reservieren: SET lead:{id}:claim NX EX LOCK_TTL_SECONDS
5. LiveKit: AgentDispatch + CreateSIPParticipant
6. call_status = dialing, livekit_room = room_name
```

### call-result (während Gespräch)

| Outcome | Aktion |
|---|---|
| `termin` | Lead-Status → Qualified |
| `interessiert` | Lead-Status → Interested |
| `abgelehnt` | Lead-Status → Not Interested |
| `do_not_call` | `do_not_call = true`, `call_status = dnc_skip` |
| `mailbox`/`keine_antwort` | `call_status = retry`, `hold_until = +60min` |

### room_finished (LiveKit-Webhook)

```
JWT + SHA256 validieren
→ Lead via livekit_room finden
→ call_status = dialing? → retry (Agent kam nie ins Gespräch)
→ call_status = active UND kein call-result? → needs_review + Task
→ Lock freigeben
→ Neuen Dispatch triggern
```

---

## Endpunkte der externen APIs (Referenz)

### Close.com REST

```
Base: https://api.close.com/api/v1/
Auth: Basic Auth (API-Key als Username, Passwort leer)
```

| Was | Endpunkt |
|---|---|
| Leads suchen | `GET /lead/?query[status_id]=...` |
| Lead aktualisieren | `PUT /lead/{id}/` |
| Custom Fields lesen | `GET /custom_fields/lead/` |
| Task erstellen | `POST /task/` |
| Note erstellen | `POST /activity/note/` |
| Anruf loggen | `POST /activity/call/` |

### Cal.com v2 API

```
Base: https://api.cal.com/v2
Auth: Bearer {CALCOM_API_KEY}
```

| Was | Endpunkt |
|---|---|
| Freie Slots | `GET /slots?eventTypeId={id}&start={iso}&end={iso}` |
| Termin buchen | `POST /bookings` |

### LiveKit API

```
Base: {LIVEKIT_URL}
Auth: JWT (HS256, api_key + api_secret)
```

| Was | Endpunkt |
|---|---|
| Agent schicken | `POST /twirp/livekit.AgentDispatchService/CreateDispatch` |
| Teilnehmer anrufen | `POST /twirp/livekit.RoomService/CreateSIPParticipant` |
| Räume listen | `POST /twirp/livekit.RoomService/ListRooms` |

### Vercel KV

```
npm install @vercel/kv
```

```typescript
import { kv } from "@vercel/kv";
await kv.set(`lead:${leadId}:claim`, claimId, { nx: true, ex: lockTtl });
```

---

## Status-IDs in Close (konstant, nicht ändern)

| Label | ID |
|---|---|
| Potential | `stat_MndpQDhY182cfTTOpcffR7NvhYcmfjrv363B6RJ1KAS` |
| Bad Fit | `stat_9SsfRt9PDRS7JBksASH8SAUPf4rtEvLUYrvAisH5oMJ` |
| Qualified | `stat_L5Wmdf4TNw1ZAVhHPYBAQYJvK4Apkb5vz8nuWemnvnM` |
| Customer | `stat_cLmomqpQpXX2M5LPhHOYTIkh00VkMlSZvxDkICGWfwe` |
| Interested | `stat_q96AwD6qFHIEFDWOOc8TSybpxsBx11GXv2RKCs3YKcd` |
| Canceled | `stat_T6QxVI9SM8vGDF5a0oLfAnk9XCTYO58SXDYzpXVhGLB` |
| Not Interested | `stat_SVwWkhogOehK0Y7USRcTJzOlr2o4YqgynkQ41QAXqxw` |

---

## Nach dem Bauen

1. `npm run build` → muss ohne Fehler durchlaufen
2. `npm run dev` → alle Endpunkte mit `curl` testen
3. `npx workflow web` → http://localhost:1744 → Runs und Steps prüfen
4. Test: Einen Lead in Close anlegen mit `call_status = ready` → Dispatcher triggern → prüfen ob Anruf gestartet wird
5. Vor Deploy: Fluid Compute in Vercel aktivieren

---

## Repo-Struktur (Soll-Zustand nach Bau)

```
/Users/Agents/Kimi/Vercel Workflows/
├── .env                        # alle Secrets (nicht committen!)
├── .env.example                # Vorlage
├── .gitignore                  # schützt .env, .workflow-data/, Build-Artefakte
├── docs/
│   ├── project.md              # vollständige Doku (einzige Quelle der Wahrheit)
│   ├── handover.md             # diese Datei
│   ├── n8n-analysis.md         # n8n-Referenz
│   └── env-setup.md            # env-Anleitung
├── workflows/
│   ├── user-signup.ts          # Demo (Referenz)
│   └── energy.ts               # ← HIER BAUEN
├── src/
│   └── index.ts                # ← HIER BAUEN
├── vercel.json                 # ← NEU: Cron-Config
├── nitro.config.ts
├── package.json                # ← + @vercel/kv
├── tsconfig.json
└── .workflow-data/             # lokale Workflow-State (nicht committen)
```

---

> **Handover erstellt:** 2026-10-02
> **Nächste Session:** User nach fehlenden env-Werten fragen → `workflows/energy.ts` + `src/index.ts` bauen → testen
