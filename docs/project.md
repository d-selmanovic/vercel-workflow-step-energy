# Energy → Vercel Workflows — Komplette Projektdokumentation

> **Stand:** 2026-10-02
> **Status:** Alle Architektur-Entscheidungen getroffen. Custom Fields angelegt. Workflow-Bau steht aus.
> **Diese Datei ist die einzige Quelle der Wahrheit.** Bei Fragen zuerst hier lesen.

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Architektur-Entscheidungen](#2-architektur-entscheidungen)
3. [Systeme & Zugänge](#3-systeme--zugänge)
4. [Close.com Setup](#4-closecom-setup)
5. [Cal.com Setup](#5-calcom-setup)
6. [LiveKit Setup](#6-livekit-setup)
7. [Workflow-Ablauf](#7-workflow-ablauf)
8. [Datenfluss: Was ersetzt was](#8-datenfluss-was-ersetzt-was)
9. [Environment-Variablen](#9-environment-variablen)
10. [Repo-Struktur](#10-repo-struktur)
11. [Kommandos](#11-kommandos)
12. [Was ist erledigt](#12-was-erledigt)
13. [Was ist offen](#13-was-ist-offen)
14. [Nächste Schritte](#14-nächste-schritte)
15. [Technische Referenz](#15-technische-referenz)

---

## 1. Projektübersicht

### Was ist Energy?

Ein automatisiertes Outbound-Callcenter:

1. Leads kommen automatisch in Close.com rein
2. Ein KI-Voice-Agent (LiveKit) ruft die Leads an
3. Der Agent führt ein Gespräch und bucht Termine (Cal.com)
4. Ergebnisse werden in Close.com protokolliert
5. Fehler werden als Tasks in Close.com eskaliert

### Warum die Migration von n8n?

Die 5 n8n-Workflows waren technisch bedingt (n8n kann keine langlaufenden Prozesse ohne Workarounds). Mit Vercel Workflow SDK wird alles zu **einem** Workflow mit durable execution, automatischem Retry und nativer Observability.

### Original in n8n (5 Workflows)

| Workflow | ID | Trigger | Aufgabe |
|---|---|---|---|
| F1 Import Sheet | `CM0vH6lsTOTzGhfl` | alle 3h | Leads aus Google Sheet importieren |
| F2 Dispatcher Outbound | `AeF2DnA1wUuf63qu` | alle 1min | Lead wählen, reservieren, Anruf starten |
| F3 Ergebnis Agent-Tools | `Evm45EwyKe77zXjc` | 4 Webhooks | Kundendaten, Termine, Ergebnis speichern |
| F4 Events Inbound | `Evm45EwyKe77zXjc` | 2 Webhooks | LiveKit-Ereignisse, Raum-Ende |
| F5 Error Alert | `P6A1IS3yMYqGbMpz` | Error-Trigger | Fehler loggen, Mail-Alert |

> **Wichtig:** F1 (Import) entfällt komplett. Leads kommen automatisch in Close.com rein.

---

## 2. Architektur-Entscheidungen

### Feste Entscheidungen (alle bestätigt)

| Thema | Entscheidung | Datum | Begründung |
|---|---|---|---|
| Workflow-Engine | Vercel Workflow SDK v4 | vor Session | Durable, Retries, Observability |
| Runtime | Nitro v3 + Express 5 | vor Session | Vercel Workflow SDK Standard |
| Voice/Telefonie | LiveKit (AgentDispatch, SIP, Webhooks) | vor Session | Kern des Projekts, bleibt |
| CRM | Close.com (Org: Step2Job) | vor Session | Leads, Protokoll, User-Interface |
| Calendar | Cal.com | vor Session | Termine finden + buchen |
| Anzahl Workflows | **Ein** Workflow | vor Session | 5 waren n8n-technisch bedingt |
| Import-Workflow | **Entfällt** | vor Session | Leads kommen automatisch in Close |
| Close-Dialer | **Nicht genutzt** | vor Session | Close Calling ist für Menschen, nicht für LiveKit |
| Playbooks | Gesprächstemplates in Close | vor Session | Keine Status-Automatisierung in Close |
| Lock/Reservierung | **Vercel KV** | 2026-09-29 | Serverlos, kostenlos bis 30k req/Tag |
| Error-Alert | **Close Task** | 2026-09-30 | Erscheint direkt in Close Inbox |
| Event-Protokoll | **Close Activities** | 2026-10-01 | Sichtbar direkt am Lead |
| Einstellungen | **env-Variablen** | 2026-10-01 | Einfach, sicher, dokumentiert |
| LiveKit Webhook | **Nativ mitnehmen** | 2026-10-01 | JWT + SHA256 Validierung einbauen |
| Cal.com Event-Type | **Energy Erstgespräch** (neu angelegt) | 2026-10-02 | 20 Minuten, ID: 7312892 |

### Was bewusst NICHT gemacht wurde

| Entscheidung | Warum |
|---|---|
| Kein WordPress-Integration | User hat explizit gesagt: komplett weglassen |
| Kein Google Sheets als Lead-Quelle | Leads kommen direkt in Close |
| Kein Postgres/Neon für Locks | Overkill — Vercel KV reicht |
| Kein Gmail für Error-Alerts | Close Task ist näher am Workflow |
| Kein eigener Event-Log in DB | Close Activities reicht |
| Keine DB für Einstellungen | env ist einfacher und sicherer |
| Kein Cal.com Webhook | Workflow bucht aktiv, braucht keine Benachrichtigung |
| Kein Cal.com MCP | API-Key reicht für den Workflow |

---

## 3. Systeme & Zugänge

### Close.com

| Feld | Wert |
|---|---|
| Organisation | Step2Job |
| Status | Trial |
| User | Denis Selmanovic (ds.selmanovic@gmail.com) |
| API-Key | `api_4B8tW0BQCoKhA99wQztvVD.0aT11XZiCkm1rskWX1y779` |
| MCP-URL | `https://mcp.close.com/mcp` |
| MCP-Transport | HTTP Streamable |
| MCP-Header | `Close-API-Key`, `Close-Scope: mcp.write_safe` |
| MCP-Tools | 68 verfügbar |
| Zugriff | ✅ Verifiziert |

### Cal.com

| Feld | Wert |
|---|---|
| User | `Den is` (dsactivi@gmail.com) |
| User-ID | `2437916` |
| Username | `den-is-brvvvb` |
| Zeitzone | `Europe/Sarajevo` |
| API-Key | `cal_live_4efb8ddd720cf73e8515c63d1b37aa16` |
| Base-URL | `https://api.cal.com` |
| Verbundene Kalender | Apple Calendar (invite, Privat, Arbeit) + Google Calendar |
| Webhooks | Keine eingerichtet (nicht nötig) |
| Zugriff | ✅ Verifiziert |

### Vercel KV

| Feld | Wert |
|---|---|
| Zweck | Lock/Reservierung (kein Doppelanruf) |
| Typ | Redis-basiert, serverlos |
| Kosten | Kostenlos bis 30.000 Requests/Tag |
| API | REST (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) |
| Setup | ⚠️ Noch nicht eingerichtet — User muss im Vercel Dashboard anlegen |

### LiveKit

| Feld | Wert |
|---|---|
| Zweck | Voice-Agent für Outbound-Anrufe |
| Features | AgentDispatch, CreateSIPParticipant, Webhooks |
| Zugänge | ⚠️ Noch nicht in env übertragen — User muss aus n8n F2 kopieren |
| Webhook-Secret | ⚠️ Noch nicht eingerichtet |

---

## 4. Close.com Setup

### Lead-Status (existierend — für Gesprächsergebnisse)

| ID | Label | Wann gesetzt |
|---|---|---|
| `stat_MndpQDhY182cfTTOpcffR7NvhYcmfjrv363B6RJ1KAS` | Potential | Standard bei neuem Lead |
| `stat_9SsfRt9PDRS7JBksASH8SAUPf4rtEvLUYrvAisH5oMJ` | Bad Fit | Lead passt nicht |
| `stat_L5Wmdf4TNw1ZAVhHPYBAQYJvK4Apkb5vz8nuWemnvnM` | Qualified | Termin gebucht |
| `stat_cLmomqpQpXX2M5LPhHOYTIkh00VkMlSZvxDkICGWfwe` | Customer | Abschluss |
| `stat_q96AwD6qFHIEFDWOOc8TSybpxsBx11GXv2RKCs3YKcd` | Interested | Lead ist interessiert |
| `stat_T6QxVI9SM8vGDF5a0oLfAnk9XCTYO58SXDYzpXVhGLB` | Canceled | Lead storniert |
| `stat_SVwWkhogOehK0Y7USRcTJzOlr2o4YqgynkQ41QAXqxw` | Not Interested | Lead lehnt ab |

### Custom Fields (angelegt am 2026-10-02, via REST API verifiziert)

| Feldname | Field-ID | Type | Werte / Zweck |
|---|---|---|---|
| `call_status` | `cf_GkNJVjPR8YqqtY6mfczlNY1wCs5HCd67zKPasvrLWJC` | choices | `ready` / `dialing` / `active` / `retry` / `hold` / `ended` / `dnc_skip` / `needs_review` |
| `call_attempts` | `cf_5ly0XyY6KTQVMhJ2VoOr4NdLKg8LYIkHxJfpYqIkIRK` | number | Anzahl Anrufversuche heute |
| `hold_until` | `cf_HRqwuBTpHpahqXKyGuytONtYSwkeU6Ex4NpS0KvxJRG` | datetime | Wartezeit bis zum nächsten Versuch |
| `do_not_call` | `cf_uwSCAf27qRepDuZFQCsfbn1lrkPDUpGwj3Luhivfdgg` | choices (`yes`) | Nicht mehr anrufen (REST-API hat keinen boolean-Typ) |
| `claim_id` | `cf_tPYcbIjCMcIL7kmYfX6vYZuEmzY54RE7z7TJ8QpXr5u` | text | Dispatcher-Lauf der den Lead reserviert hat |
| `livekit_room` | `cf_fCVlSTD8dZWCnq5rTKZwhGyFAj70IDluIfte9CKxF9D` | text | Raumname für Zuordnung |
| `call_outcome` | `cf_enDvA0i75jH1MBZVrzM7kwgzAu0V9dFQ6M806QwTKDI` | text | Letztes Ergebnis (termin/interessiert/abgelehnt/mailbox/keine_antwort) |

> Die IDs stehen im `CF`-Objekt in `workflows/energy.ts` und müssen bei Neu-Anlage synchron gehalten werden.

---

## 5. Cal.com Setup

### Event-Types (bestehend)

| ID | Titel | Slug | Länge | Sichtbar |
|---|---|---|---|---|
| `5696176` | 30 min meeting | `30min` | 30 Min | ✅ Öffentlich |
| `5696177` | Secret meeting | `secret` | 15 Min | ❌ Versteckt |

### Neuer Event-Type (angelegt am 2026-10-02)

| Feld | Wert |
|---|---|
| ID | `7312892` |
| Titel | `Energy Erstgespräch` |
| Slug | `energy-erstgespraech` |
| Länge | 20 Minuten |
| Sichtbar | ✅ Öffentlich |
| Benötigt Bestätigung | Nein |
| Min. Vorlaufzeit | 120 Minuten |

---

## 6. LiveKit Setup

### Was LiveKit im Workflow macht

| Feature | Zweck |
|---|---|
| `AgentDispatch` | Schickt den Voice-Agenten in einen Raum |
| `CreateSIPParticipant` | Ruft die Telefonnummer des Leads an |
| `ListRooms` | Prüft ob ein Raum noch existiert (Reconciliation) |
| Webhook `room_finished` | Benachrichtigt wenn ein Gespräch endet |

### Was noch eingerichtet werden muss

| Was | Wo |
|---|---|
| `LIVEKIT_URL` | Aus n8n F2 kopieren |
| `LIVEKIT_API_KEY` | Aus n8n F2 kopieren |
| `LIVEKIT_API_SECRET` | Aus n8n F2 kopieren |
| `LIVEKIT_AGENT_ID` | Aus LiveKit Dashboard |
| `LIVEKIT_WEBHOOK_SECRET` | LiveKit Dashboard → Settings → Webhooks |
| `CALLER_ID` | Telefonnummer die der Lead sieht |

---

## 7. Workflow-Ablauf

### 7.1 Übersichts-Zeichnung

```
Close.com (Leads)
     │
     │  call_status = "ready"
     ▼
┌─────────────────────────────────────┐
│  DISPATCHER (jede Minute)           │
│  1. Reconciliation: verwaiste       │
│     Anrufe beenden                  │
│  2. Lead wählen (call_status=ready) │
│  3. Atomar reservieren (Vercel KV)  │
│  4. LiveKit AgentDispatch + SIP     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  LiveKit Voice-Agent                │
│  telefoniert mit Lead               │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  WEBHOOKS (während des Gesprächs)   │
│  /agent/get-kunde  → Lead-Daten     │
│  /agent/get-termine → Cal.com Slots │
│  /agent/book-termin → Cal.com Buch  │
│  /agent/call-result → Ergebnis      │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  room_finished (LiveKit-Webhook)    │
│  JWT + SHA256 validieren            │
│  → Platz freigeben                  │
│  → Retry-Status setzen              │
│  → ggf. neuen Dispatch triggern     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  ERROR-HANDLER (überall drumherum)  │
│  → Close Activity loggen            │
│  → Lock freigeben                   │
│  → Task an Denis in Close           │
└─────────────────────────────────────┘
```

### 7.2 Dispatcher-Detail (läuft jede Minute)

```
START
  │
  ├─ Einstellungen laden (env)
  │   maxConcurrentCalls, maxAttemptsPerDay,
  │   callWindowStart, callWindowEnd, timezone
  │
  ├─ Paused? ──YES──→ END
  │
  ├─ Reconciliation
  │   Leads mit call_status = dialing oder active laden
  │   Für jeden: LiveKit-Raum noch da?
  │   NEIN → call_status = ended
  │
  ├─ Nächsten Lead wählen
  │   Filter: call_status = ready
  │   ODER: call_status = retry UND hold_until < now
  │   Prüfen: call_attempts < maxAttemptsPerDay
  │   Prüfen: aktuelle Zeit im Anruffenster (Mo–Sa)
  │   Sortierung: ältester Eintrag zuerst
  │
  ├─ Atomar reservieren (Vercel KV)
  │   SET lead:{id}:claim {claim_id} NX EX {LOCK_TTL}
  │   Erfolg? ──NO──→ nächsten Lead versuchen
  │
  ├─ LiveKit-Anruf starten
  │   JWT erzeugen (HS256)
  │   AgentDispatch → Agent in Raum
  │   CreateSIPParticipant → Lead anrufen
  │   call_status = dialing
  │   livekit_room = {room_name}
  │
  └─ Fehler beim Anrufstart?
      JA → call_status = retry
           call_attempts += 1
           hold_until = now + 60min
           Activity loggen
```

### 7.3 Webhook-Endpunkte (während des Gesprächs)

#### `POST /agent/get-kunde`
Schützt: `AGENT_WEBHOOK_SECRET` (Header)

| Input | Output |
|---|---|
| `call_id` oder `phone` | Name, Telefon, Custom Fields (call_attempts, call_outcome, …) |

#### `POST /agent/get-termine`
Schützt: `AGENT_WEBHOOK_SECRET` (Header)

| Input | Output |
|---|---|
| `datum` (optional) | Liste freier Slots `{start, end}` im 30-Min-Raster |

#### `POST /agent/book-termin`
Schützt: `AGENT_WEBHOOK_SECRET` (Header)

| Input | Aktion |
|---|---|
| `lead_id`, `slot_start`, `dauer` | Cal.com Booking erstellen |

**Bei Erfolg:**
- `call_outcome = termin`
- Lead-Status → `Qualified`
- Activity loggen

**Bei Fehler:**
- Fehler an Voice-Agent zurückgeben
- Andere Slots anbieten

#### `POST /agent/call-result`
Schützt: `AGENT_WEBHOOK_SECRET` (Header)

| Input | Aktion |
|---|---|
| `lead_id` | — |
| `outcome` | termin / interessiert / abgelehnt / mailbox / keine_antwort |
| `do_not_call` (optional) | boolean |

**Verarbeitung je nach Outcome:**

| Outcome | Aktion |
|---|---|
| `do_not_call = true` | `do_not_call = true`, `call_status = dnc_skip` |
| `termin` | Lead-Status = Qualified, Activity loggen |
| `interessiert` | Lead-Status = Interested, Activity loggen |
| `abgelehnt` | Lead-Status = Not Interested, Activity loggen |
| `mailbox` / `keine_antwort` | `call_status = retry`, `hold_until = now + 60min` |
| immer | `call_attempts += 1` |

### 7.4 room_finished (LiveKit-Webhook)

```
POST /webhooks/livekit
  │
  ├─ JWT + SHA256 Signatur validieren
  │   (LIVEKIT_WEBHOOK_SECRET)
  │
  ├─ Event = room_finished?
  │   NEIN → ignorieren (200 OK)
  │
  ├─ Lead finden via livekit_room
  │
  ├─ call_status = dialing?
  │   (Agent kam nie ins Gespräch)
  │   JA → call_status = retry
  │        hold_until = now + 60min
  │
  ├─ call_status = active?
  │   (Gespräch lief)
  │   Ergebnis schon via call-result?
  │   JA → nichts tun
  │   NEIN → call_status = needs_review
  │            Task an Denis
  │
  ├─ Lock freigeben (Vercel KV)
  │
  └─ Neuen Dispatch-Lauf triggern (start(dispatcher))
```

### 7.5 Error-Handler (global)

Jeder Fehler in jedem Step:

```
Fehler aufgetreten
  │
  ├─ Close Activity (type: note) mit Fehlerdetails
  │
  ├─ Lock freigeben (falls gesetzt)
  │
  ├─ Close Task an Denis:
  │   "Energy Error in {workflow_step}: {message}"
  │
  └─ Retry-Entscheidung:
      Temporär (Netzwerk, API down) → Step-Retry (SDK automatisch)
      Fatal (Auth falsch, Config kaputt) → FatalError, kein Retry
      Unerwartet → Task an Denis + Lock freigeben
```

### 7.6 Was-wenn-Verzweigungen (komplett)

#### Dispatcher wählt Lead

| Fall | Bedingung | Aktion |
|---|---|---|
| A | Lead gefunden + Kapazität frei + im Zeitfenster | Anrufen |
| B | Kein Lead bereit | Nichts tun, nächster Minuten-Lauf |
| C | Versuche erschöpft / außerhalb Fenster | Warten |

#### Gesprächsende (room_finished)

| Fall | Bedingung | Aktion |
|---|---|---|
| A | Verbunden | Ergebnis kommt via call-result |
| B | Mailbox / keine Antwort | retry, hold_until = +60min |
| C | Technischer Fehler | needs_review, Task an Denis |

#### call-result (Ergebnis vom Agenten)

| Fall | Bedingung | Aktion |
|---|---|---|
| A | termin / interessiert | Abschließen, ggf. Termin buchen |
| B | doNotCall | do_not_call = true, dnc_skip |
| C | abgelehnt | Not Interested |
| D | Termin ohne Buchung | Eskalation: Task an Denis |

#### book-termin (Cal.com)

| Fall | Bedingung | Aktion |
|---|---|---|
| A | Slot frei | Buchen, appointment_booked |
| B | Konflikt | Fehler an Agent, andere Slots anbieten |
| C | Doppel-Submit | Als OK behandeln (Idempotenz) |

#### Fehler (überall)

| Fall | Bedingung | Aktion |
|---|---|---|
| A | Temporär (Netzwerk, API down) | Step-Retry (SDK automatisch) |
| B | Fatal (Auth falsch, Config kaputt) | FatalError, Task an Denis |
| C | Unerwartet | Task an Denis + Lock freigeben |

---

## 8. Datenfluss: Was ersetzt was

| n8n-Element | Ersetzt durch | Wo |
|---|---|---|
| `energy_leads` DataTable | Close Leads + Custom Fields | Close.com |
| `energy_dnc` DataTable | Custom Field `do_not_call` + Lead-Status `Bad Fit` | Close.com |
| `energy_events` DataTable | Close Activities (Calls, Notes) | Close.com |
| `energy_runtime` (settings) | env-Variablen | `.env` Datei |
| `energy_runtime` (import_lock) | Entfällt | — |
| `energy_runtime` (dispatch_lock) | Vercel KV `SET NX EX` | Vercel KV |
| Google Sheet (Lead-Quelle) | Close Leads (direkt) | Close.com |
| n8n Gmail-Alert | Close Task | Close.com |
| n8n Cal.com-Node | Cal.com API direkt | Cal.com API |

---

## 9. Environment-Variablen

### Vollständige Liste

| Variable | Pflicht | Default | Zweck |
|---|---|---|---|
| `CLOSE_API_KEY` | ✅ | — | Close API-Key |
| `CLOSE_ORG_NAME` | optional | Step2Job | Nur Info |
| `CLOSE_USER_ID` | ✅ | — | Close User-ID für Tasks |
| `CLOSE_STATUS_POTENTIAL` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_BAD_FIT` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_QUALIFIED` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_CUSTOMER` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_INTERESTED` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_CANCELED` | ✅ | — | Lead-Status ID |
| `CLOSE_STATUS_NOT_INTERESTED` | ✅ | — | Lead-Status ID |
| `CALCOM_API_KEY` | ✅ | — | Cal.com API-Key |
| `CALCOM_EVENT_TYPE_ID` | ✅ | — | Energy Erstgespräch: 7312892 |
| `CALCOM_BASE_URL` | optional | `https://api.cal.com` | Cal.com API Base |
| `LIVEKIT_URL` | ✅ | — | LiveKit Server URL |
| `LIVEKIT_API_KEY` | ✅ | — | LiveKit API-Key |
| `LIVEKIT_API_SECRET` | ✅ | — | LiveKit API-Secret |
| `LIVEKIT_AGENT_ID` | ✅ | — | Voice-Agent ID |
| `CALLER_ID` | ✅ | — | Anrufernummer (E.164) |
| `LIVEKIT_WEBHOOK_SECRET` | ✅ | — | Webhook Signatur-Validierung |
| `MAX_CONCURRENT_CALLS` | optional | `1` | Max. gleichzeitige Anrufe |
| `MAX_ATTEMPTS_PER_DAY` | optional | `3` | Max. Versuche pro Tag |
| `CALL_WINDOW_START` | optional | `09:00` | Anruffenster Start |
| `CALL_WINDOW_END` | optional | `18:00` | Anruffenster Ende |
| `TIMEZONE` | optional | `Europe/Berlin` | Zeitzone |
| `RETRY_WAIT_MINUTES` | optional | `60` | Wartezeit zwischen Versuchen |
| `LOCK_TTL_SECONDS` | optional | `3600` | Lock-Gültigkeit |
| `KV_REST_API_URL` | ✅ | — | Vercel KV URL |
| `KV_REST_API_TOKEN` | ✅ | — | Vercel KV Token |
| `AGENT_WEBHOOK_SECRET` | ✅ | — | Schützt /agent/* Endpunkte |

> **Vorlagen:** `.env.example` (im Root) und Anleitung in `docs/env-setup.md`

---

## 10. Repo-Struktur

```
/Users/Agents/Kimi/Vercel Workflows/
├── AGENTS.md                    # Projektregeln, Kommandos, Konventionen
├── README.md                    # Setup, Kommandos, Observability
├── .env.example                 # Vorlage für alle env-Variablen
├── .env                         # Secrets (lokal, nicht committen)
├── .gitignore
├── docs/
│   ├── project.md               # vollständige Doku (einzige Quelle der Wahrheit)
│   ├── n8n-analysis.md          # Detail-Analyse der 5 n8n-Workflows
│   ├── handover.md              # Übergabe für nächste Session
│   └── env-setup.md             # Anleitung für .env
├── src/
│   └── index.ts                 # Express-App, Endpunkte, start() Aufrufe
├── workflows/
│   ├── user-signup.ts           # Demo-Workflow (Referenz)
│   └── energy.ts                # → Energy-Workflow (noch nicht gebaut)
├── nitro.config.ts              # Nitro-Build mit workflow/nitro
├── package.json
├── tsconfig.json
└── vercel.json                  # → Cron-Config (noch nicht angelegt)
```

---

## 11. Kommandos

| Zweck | Befehl |
|---|---|
| Dev-Server starten | `npm run dev` → http://localhost:3000 |
| Workflow triggern (Demo) | `curl -X POST --json '{"email":"x@y.de"}' http://localhost:3000/api/signup` |
| Web-UI (Observability) | `npx workflow web` → http://localhost:1744 |
| Terminal (Observability) | `npx workflow inspect runs` |
| Build | `npm run build` |
| Env-Datei erstellen | `cp .env.example .env` |

---

## 12. Was ist erledigt

| Was | Datum | Status |
|---|---|---|
| n8n-Workflows analysiert (F1–F5) | vor Session | ✅ |
| Ablauf-Beschreibung + User-Bestätigung | vor Session | ✅ |
| Close.com-Docs geprüft | vor Session | ✅ |
| Close MCP eingerichtet + Zugriff verifiziert | vor Session | ✅ |
| Projekt-Doku erstellt (project.md, n8n-analysis.md, handover.md) | vor Session | ✅ |
| Lock/Reservierung → Vercel KV entschieden | 2026-09-29 | ✅ |
| Error-Alert → Close Task entschieden | 2026-09-30 | ✅ |
| Event-Protokoll → Close Activities entschieden | 2026-10-01 | ✅ |
| Einstellungen → env entschieden | 2026-10-01 | ✅ |
| LiveKit Webhook → nativ mitnehmen entschieden | 2026-10-01 | ✅ |
| `.env.example` erstellt | 2026-10-01 | ✅ |
| `docs/env-setup.md` erstellt | 2026-10-01 | ✅ |
| Cal.com API-Key erhalten + verifiziert | 2026-10-02 | ✅ |
| Cal.com Event-Type „Energy Erstgespräch" angelegt (ID: 7312892) | 2026-10-02 | ✅ |
| **7 Custom Fields in Close angelegt** | 2026-10-02 | ✅ |
| Alle 6 Architektur-Fragen geklärt | 2026-10-02 | ✅ |

---

## 13. Was ist offen

### User muss noch liefern

| Was | Woher | Priorität |
|---|---|---|
| `CLOSE_USER_ID` | Close → Settings → Team Management | Hoch |
| `LIVEKIT_URL` | Aus n8n F2 kopieren | Hoch |
| `LIVEKIT_API_KEY` | Aus n8n F2 kopieren | Hoch |
| `LIVEKIT_API_SECRET` | Aus n8n F2 kopieren | Hoch |
| `LIVEKIT_AGENT_ID` | LiveKit Dashboard | Hoch |
| `LIVEKIT_WEBHOOK_SECRET` | LiveKit Dashboard → Settings → Webhooks | Hoch |
| `CALLER_ID` | Telefonnummer die der Lead sieht | Hoch |
| `KV_REST_API_URL` | Vercel Dashboard → Storage → KV | Hoch |
| `KV_REST_API_TOKEN` | Vercel Dashboard → Storage → KV | Hoch |
| `AGENT_WEBHOOK_SECRET` | Selbst erzeugen (langer zufälliger String) | Mittel |

### Workflow-Bau (was noch programmiert werden muss)

| Was | Datei | Status |
|---|---|---|
| Dispatcher-Step | `workflows/energy.ts` | ❌ Nicht gebaut |
| Webhook-Steps (get-kunde, get-termine, book-termin, call-result) | `workflows/energy.ts` | ❌ Nicht gebaut |
| room_finished Step | `workflows/energy.ts` | ❌ Nicht gebaut |
| Error-Handler Step | `workflows/energy.ts` | ❌ Nicht gebaut |
| Vercel KV Integration | `workflows/energy.ts` | ❌ Nicht gebaut |
| Cal.com API Integration | `workflows/energy.ts` | ❌ Nicht gebaut |
| LiveKit API Integration | `workflows/energy.ts` | ❌ Nicht gebaut |
| Alle Express-Endpunkte | `src/index.ts` | ❌ Nicht gebaut |
| End-to-End-Test | — | ❌ Nicht gemacht |

---

## 14. Nächste Schritte

### Sofort (User)

1. Vercel KV im Dashboard anlegen → `KV_REST_API_URL` + `KV_REST_API_TOKEN` kopieren
2. LiveKit-Zugänge aus n8n F2 kopieren
3. `CLOSE_USER_ID` aus Close kopieren
4. `.env` Datei aus `.env.example` erstellen und ausfüllen

### Dann (Agent)

1. `npm install @vercel/kv` — KV-Client installieren
2. `workflows/energy.ts` schreiben:
   - `dispatch` Step
   - `getKunde`, `getTermine`, `bookTermin`, `callResult` Steps
   - `roomFinished` Step
   - `errorHandler` Step
3. `src/index.ts` erweitern mit allen Endpunkten
4. Lokaler Test mit `npm run dev`
5. Observability prüfen mit `npx workflow web`
6. End-to-End-Test

---

## 15. Technische Referenz

### n8n → Vercel Workflow SDK Entsprechungen

| n8n | Vercel Workflow SDK |
|---|---|
| HTTP Request Node | `fetch` in einem `"use step"` |
| Wait / Delay Node | `sleep("5s")` im Workflow (durable) |
| Schedule Trigger | Vercel Cron → Endpoint → `start()` |
| Retry on Fail | Standard bei Steps (`FatalError` = kein Retry) |
| Set / Code Node | TypeScript im Step/Workflow |
| Webhook Trigger | Express-Route, die `start()` aufruft |
| DataTable (n8n) | Close Custom Fields + Vercel KV für Locks |

### Close MCP Tools (Auswahl)

| Tool | Zweck |
|---|---|
| `find_lead_custom_fields` | Custom Fields auflisten |
| `create_lead` | Lead anlegen |
| `fetch_lead` | Lead lesen |
| `find_tasks` | Tasks suchen |
| `create_task` | Task erstellen |
| `create_note` | Activity/Notiz erstellen |
| `lead_search` | Leads suchen |

### Cal.com API Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /v2/me` | User-Info |
| `GET /v2/event-types` | Event-Types auflisten |
| `POST /v2/event-types` | Event-Type anlegen |
| `GET /v2/calendars` | Verbundene Kalender |
| `GET /v2/slots` | Freie Slots abrufen |
| `POST /v2/bookings` | Termin buchen |

### Vercel KV API

| Befehl | Zweck |
|---|---|
| `SET key value NX EX ttl` | Atomar setzen (Lock) |
| `GET key` | Wert lesen |
| `DEL key` | Wert löschen (Lock freigeben) |

### Stack

| Komponente | Version |
|---|---|
| Node.js | ESM, `type: "module"` |
| Vercel Workflow SDK | `workflow` v4.8.9 |
| Nitro | v3.0.260903-beta |
| Express | v5.2.1 |
| TypeScript | v7.0.2 |

### Konventionen (aus AGENTS.md)

- Workflow-Funktionen in `workflows/*.ts` (keine `"use workflow"` in `src/index.ts`)
- Externe Aufrufe, I/O und Fehleranfälliges in `"use step"` — nur Steps werden mit Retry neu ausgeführt
- Kein Retry bei nicht behebbaren Fehlern: `throw new FatalError(...)` aus `workflow`
- HTTP-Endpunkte in `src/index.ts` bleiben dünn: Body validieren, `start(workflowFn, [args])` aufrufen, sofort antworten
- Vor Deploy: **Fluid Compute aktivieren** (sonst Cold Start bei jedem Workflow-Resume)

---

> **Letzte Aktualisierung:** 2026-10-02
> **Nächste geplante Aktualisierung:** Nach Workflow-Bau
