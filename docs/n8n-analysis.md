# n8n-Analyse: Energy F1–F5

Hier liegt der Original-Ablauf der 5 exportierten n8n-Workflows, als Referenz
für den Bau in TypeScript. Als Klartext, damit der Ablauf geprüft/optimiert
werden kann, bevor er in Code geht.

## Übersicht (als eine Pipeline)

Google Sheet „F1-Liste" → **F1 Import** → DB (leads/dnc/events/runtime)
→ **F2 Dispatch** (jede Minute) → LiveKit-Anruf → **F3 Agent-Tools** (Webhooks)
+ **F4 Events** (Webhooks) → Ergebnis/Auswertung → ggf. erneuter F2-Lauf.
Überall hängt **F5 Error Alert**.

```
Google Sheet → F1 Import → DB(leads/dnc/events/runtime) → F2 Dispatch
→ LiveKit-Agent → Webhooks (F3 Tools, F4 Events) → Auswertung → neuer F2-Lauf
```

## Gemeinsame Daten (n8n DataTables → Close Custom Fields + Vercel KV)

| DataTable | Zweck |
|---|---|
| `energy_leads` | Leads mit Status (queued, dialin, active, retry_wait, dnc_skip, ended, needs_review) |
| `energy_dnc` | Do-Not-Call-Liste |
| `energy_events` | Protokoll aller Ereignisse (import, call_dispatched, call_start_error, workflow_error, appointment_booked, alert_delivery_failed) |
| `energy_runtime` | Laufzeit-Konfig: settings (JSON), import_lock |

## F1 – Import Sheet (alle 3h)

1. `import_lock` auf eigene Execution-ID setzen.
2. Sheet „Energy-WarmUP-F1-Liste" lesen.
3. Bestehende Leads + DNC-Liste laden.
4. Pro Zeile validieren: fehlende kundenId / ungültige Nummer → Fehler;
   Duplikat (Sheet oder DB) → überspringen; Nummer normalisieren (+49…);
   DNC-Treffer → `dnc_skip`.
5. Gültige Zeilen → `energy_leads` (Status `queued`) + `energy_events` (import).
6. Lock freigeben. Timeout 900s.

## F2 – Dispatcher Outbound (alle 1min + triggert aus F4)

1. Einstellungen aus `energy_runtime` laden (timezone, maxConcurrentCalls 1–5,
   maxAttemptsPerDay 1–3, Anruffenster, LiveKit-Config). `paused?` → Abbruch.
2. JWT erzeugen, LiveKit `ListRooms`.
3. Reconciliation: verwaiste Anrufe (busy >5min, Raum weg) → callState=ended,
   ggf. needs_review.
4. DNC laden → nächsten Lead wählen (queued/retry_wait/voicemail/nicht_erreicht,
   Mo–Sa im Fenster, attempts < max).
5. Atomar reservieren (claimId = Execution-ID).
6. Kapazität, DNC, Zeitfenster prüfen → LiveKit `AgentDispatch` +
   `CreateSIPParticipant` → Status dialin/active, Events call_dispatched /
   call_start_error.

## F3 – Ergebnis Agent-Tools (4 Webhooks, Header-Auth)

- `energy-get-kunde` → Lead-Daten an Voice-Agent.
- `energy-call-result` → Ergebnis atomar speichern (termin/interessiert/
  abgelehnt/mailbox/keine_antwort). doNotCall → DNC-Eintrag. „Termin ohne
  Buchung" → Gmail-Eskalation.
- `get-termine` → freie Slots aus Google Calendar (30-Min-Raster, Anruffenster).
- `book-termin` → Buchung mit atomarer Sperre (pendingBooking), Konflikt-Prüfung,
  Idempotenz via Event-ID (409-Handling), Buchung im Lead + appointment_booked.

## F4 – Events Inbound (2 Webhooks)

- `energy-lk-events` (Header-Auth): Event normalisieren (room, phone, inbound,
  eventName) → in `energy_events`. Bei `room_finished` (ausgehend): Lead zum
  Raum finden → Platz freigeben; mailbox/keine_antwort → holdUntil +60min,
  Status retry_wait/dnc → F2 neuer Lauf triggern. Eingehend: inboundActive
  setzen/zurücksetzen.
- `energy-lk-events-native` (LiveKit-nativ): rawBody + JWT-Verify + SHA256-Hash.

## F5 – Error Alert (Error-Workflow, hängt an allen)

1. Fehler aufbereiten (Bearer/Secrets redactieren, executionId, callId, subject
   `Energy ERROR: {workflowName}`).
2. `energy_events` upsert (workflow_error).
3. `import_lock` in `energy_runtime` auf `free` setzen.
4. Gmail-Alert an ds@activi.io. Fehlschlag → `alert_delivery_failed`.

## Verzweigungen (Was-wenn)

- **Import-Zeile:** A gültig → importieren; B ungültig → Fehler loggen; C
  Duplikat/DNC → überspringen.
- **Dispatch:** A Lead+Kapazität+Fenster → anrufen; B kein Lead → nichts;
  C Versuche ausgeschöpft/außerhalb Fenster → warten.
- **Gesprächsende:** A verbunden → Ergebnis; B mailbox/keine Antwort → +60min
  retry_wait; C techn. Fehler → needs_review + Alert.
- **call-result:** A termin/interessiert → abschließen; B doNotCall → DNC;
  C abgelehnt → abschließen; D Termin ohne Buchung → Gmail-Eskalation.
- **book-termin:** A frei → buchen; B Konflikt → Fehler an Agent; C Doppel-Submit
  → als OK behandeln.
- **Fehler:** A temporär → Step-Retry; B fatal → sofort stoppen + Alert;
  C unerwartet → Alert + Lock freigeben.

## Ersetzte Komponenten (Stand Migration)

- Google Sheet → **Close.com** (Leads).
- n8n DataTables → **Close Custom Fields + Vercel KV** (Locks).
- Webhook-Auth: Header-Secret → env/DB-secret.
