# .env-Datei — Anleitung und Referenz

## Was ist die .env-Datei?

Die `.env`-Datei im Projekt-Stammverzeichnis enthält alle Einstellungen und Zugänge, die der Workflow braucht — ohne sie läuft nichts. Sie ist **lokal**, **geheim** und gehört **niemals** in Git.

> **Wichtig:** Die Datei `.env` steht bereits in `.gitignore`. Füge sie niemals dem Repository hinzu.

---

## Schnellstart

```bash
# 1. Im Projekt-Stammverzeichnis:
cp .env.example .env

# 2. .env in einem Texteditor öffnen und alle (PFLICHT)-Felder ausfüllen

# 3. Dev-Server neu starten:
npm run dev
```

---

## Struktur der .env.example

Die Vorlage `.env.example` ist in **5 Abschnitte** unterteilt. Jede Zeile ist kommentiert:

- **`# (PFLICHT)`** — ohne diesen Wert läuft der Workflow nicht oder stürzt ab
- **`# (OPTIONAL)`** — hat einen sinnvollen Standardwert, kann erstmal so bleiben

---

## Abschnitt 1 — Close.com CRM

| Variable | Pflicht | Zweck |
|---|---|---|
| `CLOSE_API_KEY` | ✅ PFLICHT | Dein API-Key. Wo: Close → Settings → API Keys → Add New Key |
| `CLOSE_ORG_NAME` | optional | Nur zur Info. Der Workflow nutzt den Key, nicht den Namen |
| `CLOSE_USER_ID` | ✅ PFLICHT | Deine User-ID in Close. Wo: Close → Settings → Team Management → dein Name → ID kopieren |
| `CLOSE_STATUS_*` | ✅ PFLICHT | Die IDs der 7 Lead-Status, die nach dem Gespräch gesetzt werden. Wo: Close → Settings → Customizations → Lead Statuses |

**Beispiel für die Lead-Status-IDs:**
```
CLOSE_STATUS_POTENTIAL=stat_MndpQDhY182cfTTOpcffR7NvhYcmfjrv363B6RJ1KAS
CLOSE_STATUS_QUALIFIED=stat_L5Wmdf4TNw1ZAVhHPYBAQYJvK4Apkb5vz8nuWemnvnM
# ... etc.
```

---

## Abschnitt 2 — Cal.com Terminbuchung

| Variable | Pflicht | Zweck |
|---|---|---|
| `CALCOM_API_KEY` | ✅ PFLICHT | Dein API-Key: `cal_live_4efb8ddd720cf73e8515c63d1b37aa16` |
| `CALCOM_EVENT_TYPE_ID` | ✅ PFLICHT | Energy Erstgespräch, 20 Min — ID: `7312892` |
| `CALCOM_BASE_URL` | optional | Default: `https://api.cal.com` |

---

## Abschnitt 3 — LiveKit Voice

| Variable | Pflicht | Zweck |
|---|---|---|
| `LIVEKIT_URL` | ✅ PFLICHT | Deine LiveKit-Server-URL. Format: `wss://dein-projekt.livekit.cloud` |
| `LIVEKIT_API_KEY` | ✅ PFLICHT | API-Key aus dem LiveKit-Dashboard |
| `LIVEKIT_API_SECRET` | ✅ PFLICHT | API-Secret aus dem LiveKit-Dashboard |
| `LIVEKIT_AGENT_ID` | ✅ PFLICHT | Der Voice-Agent, der den Lead anruft. Aus deinem LiveKit-Setup |
| `CALLER_ID` | ✅ PFLICHT | Telefonnummer, die der Lead auf dem Display sieht. Format: `+49...` |
| `LIVEKIT_WEBHOOK_SECRET` | ✅ PFLICHT | Für Signatur-Validierung eingehender Webhooks. Wo: LiveKit Dashboard → Settings → Webhooks |

---

## Abschnitt 4 — Workflow-Einstellungen

| Variable | Pflicht | Default | Zweck |
|---|---|---|---|
| `MAX_CONCURRENT_CALLS` | optional | `1` | Wie viele Anrufe gleichzeitig laufen dürfen |
| `MAX_ATTEMPTS_PER_DAY` | optional | `3` | Wie oft ein Lead pro Tag angerufen wird, bevor Pause |
| `CALL_WINDOW_START` | optional | `09:00` | Ab wann angerufen wird (Mo–Sa) |
| `CALL_WINDOW_END` | optional | `18:00` | Bis wann angerufen wird (Mo–Sa) |
| `TIMEZONE` | optional | `Europe/Berlin` | Zeitzone für das Anruffenster |
| `RETRY_WAIT_MINUTES` | optional | `60` | Pause zwischen zwei Anrufversuchen |
| `LOCK_TTL_SECONDS` | optional | `3600` | Wie lange ein Lock gültig bleibt |

---

## Abschnitt 5 — Vercel KV und Webhook-Sicherheit

| Variable | Pflicht | Zweck |
|---|---|---|
| `KV_REST_API_URL` | ✅ PFLICHT | Vercel Dashboard → Storage → KV → deine Datenbank → REST API URL |
| `KV_REST_API_TOKEN` | ✅ PFLICHT | Dasselbe Menü → REST API Token |
| `AGENT_WEBHOOK_SECRET` | ✅ PFLICHT | Ein beliebiger langer geheimer String. Schützt die Endpunkte `/agent/*` |

---

## Checkliste: Was muss ich als Erstes eintragen?

Bewor du mit dem Bauen beginnst, brauchst du mindestens:

```
✅ CLOSE_API_KEY
✅ CLOSE_USER_ID
✅ CLOSE_STATUS_* (alle 7)
✅ CALCOM_API_KEY, CALCOM_EVENT_TYPE_ID
✅ LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_AGENT_ID, LIVEKIT_WEBHOOK_SECRET
✅ CALLER_ID
✅ AGENT_WEBHOOK_SECRET
✅ KV_REST_API_URL, KV_REST_API_TOKEN
```

**Was du noch NICHT brauchst** (kann später nachgetragen werden):
- Die optionalen Workflow-Einstellungen (laufen mit Defaults)

---

## Häufige Fehler

| Fehler | Ursache | Lösung |
|---|---|---|
| `CLOSE_API_KEY is not set` | `.env` nicht vorhanden oder Key nicht eingetragen | `cp .env.example .env` und ausfüllen |
| `KV_REST_API_URL is not set` | KV nicht eingerichtet | Siehe Abschnitt Vercel KV oben |
| Server startet nicht | Tippfehler in `.env` | Keine Leerzeichen um `=`, keine Anführungszeichen nötig |
| `401 Unauthorized` | Close-Key falsch oder abgelaufen | Neuen Key in Close erstellen |
