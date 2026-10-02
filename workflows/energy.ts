import { FatalError } from "workflow";
import { start } from "workflow/api";
import { kv } from "@vercel/kv";
import { createHmac } from "node:crypto";

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

interface Settings {
  closeApiKey: string;
  closeUserId: string;
  closeStatus: {
    potential: string;
    badFit: string;
    qualified: string;
    customer: string;
    interested: string;
    canceled: string;
    notInterested: string;
  };
  calcomApiKey: string;
  calcomEventTypeId: string;
  calcomBaseUrl: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitAgentId: string;
  callerId: string;
  livekitSipTrunkId: string;
  maxConcurrentCalls: number;
  maxAttemptsPerDay: number;
  callWindowStart: string;
  callWindowEnd: string;
  timezone: string;
  retryWaitMinutes: number;
  lockTtlSeconds: number;
}

interface Lead {
  id: string;
  displayName: string;
  phone: string;
  callStatus: string | null;
  callAttempts: number;
  holdUntil: string | null;
  doNotCall: boolean;
  claimId: string | null;
  livekitRoom: string | null;
  callOutcome: string | null;
  dateCreated: string;
}

type CallOutcome =
  | "termin"
  | "interessiert"
  | "abgelehnt"
  | "mailbox"
  | "keine_antwort";

// ─────────────────────────────────────────────
// Settings (Step)
// ─────────────────────────────────────────────

async function loadSettings(): Promise<Settings> {
  "use step";

  const e = process.env;
  const required: [string, string | undefined][] = [
    ["CLOSE_API_KEY", e.CLOSE_API_KEY],
    ["CLOSE_USER_ID", e.CLOSE_USER_ID],
    ["CLOSE_STATUS_POTENTIAL", e.CLOSE_STATUS_POTENTIAL],
    ["CLOSE_STATUS_BAD_FIT", e.CLOSE_STATUS_BAD_FIT],
    ["CLOSE_STATUS_QUALIFIED", e.CLOSE_STATUS_QUALIFIED],
    ["CLOSE_STATUS_CUSTOMER", e.CLOSE_STATUS_CUSTOMER],
    ["CLOSE_STATUS_INTERESTED", e.CLOSE_STATUS_INTERESTED],
    ["CLOSE_STATUS_CANCELED", e.CLOSE_STATUS_CANCELED],
    ["CLOSE_STATUS_NOT_INTERESTED", e.CLOSE_STATUS_NOT_INTERESTED],
    ["CALCOM_API_KEY", e.CALCOM_API_KEY],
    ["CALCOM_EVENT_TYPE_ID", e.CALCOM_EVENT_TYPE_ID],
    ["LIVEKIT_URL", e.LIVEKIT_URL],
    ["LIVEKIT_API_KEY", e.LIVEKIT_API_KEY],
    ["LIVEKIT_API_SECRET", e.LIVEKIT_API_SECRET],
    ["LIVEKIT_AGENT_ID", e.LIVEKIT_AGENT_ID],
    ["CALLER_ID", e.CALLER_ID],
    ["LIVEKIT_SIP_TRUNK_ID", e.LIVEKIT_SIP_TRUNK_ID],
    ["KV_REST_API_URL", e.KV_REST_API_URL],
    ["KV_REST_API_TOKEN", e.KV_REST_API_TOKEN],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new FatalError(`Fehlende env-Variablen: ${missing.join(", ")}`);
  }

  return {
    closeApiKey: e.CLOSE_API_KEY!,
    closeUserId: e.CLOSE_USER_ID!,
    closeStatus: {
      potential: e.CLOSE_STATUS_POTENTIAL!,
      badFit: e.CLOSE_STATUS_BAD_FIT!,
      qualified: e.CLOSE_STATUS_QUALIFIED!,
      customer: e.CLOSE_STATUS_CUSTOMER!,
      interested: e.CLOSE_STATUS_INTERESTED!,
      canceled: e.CLOSE_STATUS_CANCELED!,
      notInterested: e.CLOSE_STATUS_NOT_INTERESTED!,
    },
    calcomApiKey: e.CALCOM_API_KEY!,
    calcomEventTypeId: e.CALCOM_EVENT_TYPE_ID!,
    calcomBaseUrl: e.CALCOM_BASE_URL ?? "https://api.cal.com",
    livekitUrl: e.LIVEKIT_URL!,
    livekitApiKey: e.LIVEKIT_API_KEY!,
    livekitApiSecret: e.LIVEKIT_API_SECRET!,
    livekitAgentId: e.LIVEKIT_AGENT_ID!,
    callerId: e.CALLER_ID!,
    livekitSipTrunkId: e.LIVEKIT_SIP_TRUNK_ID!,
    maxConcurrentCalls: Number(e.MAX_CONCURRENT_CALLS ?? 1),
    maxAttemptsPerDay: Number(e.MAX_ATTEMPTS_PER_DAY ?? 3),
    callWindowStart: e.CALL_WINDOW_START ?? "09:00",
    callWindowEnd: e.CALL_WINDOW_END ?? "18:00",
    timezone: e.TIMEZONE ?? "Europe/Berlin",
    retryWaitMinutes: Number(e.RETRY_WAIT_MINUTES ?? 60),
    lockTtlSeconds: Number(e.LOCK_TTL_SECONDS ?? 3600),
  };
}

// ─────────────────────────────────────────────
// Helfer (keine Steps — nur innerhalb von Steps nutzen)
// ─────────────────────────────────────────────

const CLOSE_BASE = "https://api.close.com/api/v1";

const CF = {
  callStatus: "custom.cf_GkNJVjPR8YqqtY6mfczlNY1wCs5HCd67zKPasvrLWJC",
  callAttempts: "custom.cf_5ly0XyY6KTQVMhJ2VoOr4NdLKg8LYIkHxJfpYqIkIRK",
  holdUntil: "custom.cf_HRqwuBTpHpahqXKyGuytONtYSwkeU6Ex4NpS0KvxJRG",
  doNotCall: "custom.cf_uwSCAf27qRepDuZFQCsfbn1lrkPDUpGwj3Luhivfdgg",
  claimId: "custom.cf_tPYcbIjCMcIL7kmYfX6vYZuEmzY54RE7z7TJ8QpXr5u",
  livekitRoom: "custom.cf_fCVlSTD8dZWCnq5rTKZwhGyFAj70IDluIfte9CKxF9D",
  callOutcome: "custom.cf_enDvA0i75jH1MBZVrzM7kwgzAu0V9dFQ6M806QwTKDI",
} as const;

function closeHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

function normalizeLead(raw: any): Lead {
  const phones: string[] = (raw.contacts ?? []).flatMap(
    (c: any) => (c.phones ?? []).map((p: any) => p.phone as string),
  );
  return {
    id: raw.id,
    displayName: raw.display_name ?? raw.name ?? raw.id,
    phone: phones[0] ?? "",
    callStatus: raw[CF.callStatus] ?? null,
    callAttempts: Number(raw[CF.callAttempts] ?? 0),
    holdUntil: raw[CF.holdUntil] ?? null,
    doNotCall: raw[CF.doNotCall] === "yes",
    claimId: raw[CF.claimId] ?? null,
    livekitRoom: raw[CF.livekitRoom] ?? null,
    callOutcome: raw[CF.callOutcome] ?? null,
    dateCreated: raw.date_created ?? "",
  };
}

function jwtHs256(
  key: string,
  secret: string,
  payload: Record<string, unknown>,
): string {
  const b64 = (input: string | Buffer) =>
    Buffer.from(input).toString("base64url");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ ...payload, iss: key }));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function livekitHttpBase(url: string): string {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

function livekitJwt(s: Settings, video: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  return jwtHs256(s.livekitApiKey, s.livekitApiSecret, {
    exp: now + 600,
    nbf: now - 10,
    iat: now,
    video,
  });
}

async function livekitTwirp(
  s: Settings,
  service: string,
  method: string,
  video: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(
    `${livekitHttpBase(s.livekitUrl)}/twirp/livekit.${service}/${method}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${livekitJwt(s, video)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`LiveKit Auth-Fehler ${res.status}: ${text}`);
    }
    throw new Error(`LiveKit ${method} fehlgeschlagen ${res.status}: ${text}`);
  }
  return res.json();
}

function leadUpdateBody(leadId: string, fields: Record<string, unknown>) {
  return { lead_id: leadId, ...fields };
}

function redact(message: string): string {
  return message
    .replace(/api_[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/cal_live_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Basic\s+\S+/gi, "Basic [redacted]");
}

function isInCallWindow(s: Settings): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: s.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sun") return false;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const [sh, sm] = s.callWindowStart.split(":").map(Number);
  const [eh, em] = s.callWindowEnd.split(":").map(Number);
  return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
}

// ─────────────────────────────────────────────
// Close.com Steps
// ─────────────────────────────────────────────

async function closeFetchLead(
  apiKey: string,
  leadId: string,
): Promise<Lead | null> {
  "use step";

  const res = await fetch(
    `${CLOSE_BASE}/lead/${encodeURIComponent(leadId)}/`,
    { headers: closeHeaders(apiKey) },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`Close Auth-Fehler ${res.status}`);
    }
    throw new Error(`Close lead fetch fehlgeschlagen: ${res.status}`);
  }
  return normalizeLead(await res.json());
}

async function closeSearchLeads(
  apiKey: string,
  query: Record<string, unknown>,
  limit = 10,
): Promise<Lead[]> {
  "use step";

  const params = new URLSearchParams({
    query: JSON.stringify(query),
    _limit: String(limit),
  });
  const res = await fetch(`${CLOSE_BASE}/lead/?${params}`, {
    headers: closeHeaders(apiKey),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`Close Auth-Fehler ${res.status}`);
    }
    throw new Error(`Close lead search fehlgeschlagen: ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []).map(normalizeLead);
}

async function closeUpdateLead(
  apiKey: string,
  leadId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  "use step";

  const res = await fetch(
    `${CLOSE_BASE}/lead/${encodeURIComponent(leadId)}/`,
    {
      method: "PUT",
      headers: closeHeaders(apiKey),
      body: JSON.stringify(leadUpdateBody(leadId, fields)),
    },
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`Close Auth-Fehler ${res.status}`);
    }
    throw new Error(`Close lead update fehlgeschlagen: ${res.status}`);
  }
}

async function closeLogNote(
  apiKey: string,
  leadId: string,
  note: string,
): Promise<void> {
  "use step";

  const res = await fetch(`${CLOSE_BASE}/activity/note/`, {
    method: "POST",
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ lead_id: leadId, note }),
  });
  if (!res.ok) {
    throw new Error(`Close note fehlgeschlagen: ${res.status}`);
  }
}

async function closeLogCall(
  apiKey: string,
  leadId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  "use step";

  const res = await fetch(`${CLOSE_BASE}/activity/call/`, {
    method: "POST",
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ lead_id: leadId, ...fields }),
  });
  if (!res.ok) {
    throw new Error(`Close call activity fehlgeschlagen: ${res.status}`);
  }
}

async function closeCreateTask(
  apiKey: string,
  leadId: string,
  userId: string,
  text: string,
): Promise<void> {
  "use step";

  const res = await fetch(`${CLOSE_BASE}/task/`, {
    method: "POST",
    headers: closeHeaders(apiKey),
    body: JSON.stringify({
      lead_id: leadId,
      assigned_to: userId,
      text,
      date: new Date().toISOString().slice(0, 10),
    }),
  });
  if (!res.ok) {
    throw new Error(`Close task fehlgeschlagen: ${res.status}`);
  }
}

// ─────────────────────────────────────────────
// KV Steps
// ─────────────────────────────────────────────

async function kvClaimLead(
  leadId: string,
  claimId: string,
  ttlSeconds: number,
): Promise<boolean> {
  "use step";

  const result = await kv.set(`lead:${leadId}:claim`, claimId, {
    nx: true,
    ex: ttlSeconds,
  });
  return result === "OK";
}

async function kvReleaseLead(leadId: string): Promise<void> {
  "use step";

  await kv.del(`lead:${leadId}:claim`);
}

// ─────────────────────────────────────────────
// LiveKit Steps
// ─────────────────────────────────────────────

async function livekitListRoomNames(s: Settings): Promise<string[]> {
  "use step";

  const json = await livekitTwirp(s, "RoomService", "ListRooms", {
    roomAdmin: true,
    room: "",
  });
  return (json.rooms ?? []).map((r: any) => r.name as string);
}

async function livekitDispatchAgent(s: Settings, roomName: string): Promise<void> {
  "use step";

  await livekitTwirp(
    s,
    "AgentDispatchService",
    "CreateDispatch",
    { roomAdmin: true, room: roomName },
    { room: roomName, agent_name: s.livekitAgentId },
  );
}

async function livekitCallPhone(
  s: Settings,
  roomName: string,
  phone: string,
): Promise<void> {
  "use step";

  await livekitTwirp(
    s,
    "RoomService",
    "CreateSIPParticipant",
    { roomAdmin: true, room: roomName },
    {
      room_name: roomName,
      sip_trunk_id: s.livekitSipTrunkId,
      sip_trunk_phone_number: s.callerId,
      sip_call_to: phone,
      participant_identity: `lead-${phone}`,
    },
  );
}

// ─────────────────────────────────────────────
// Cal.com Steps
// ─────────────────────────────────────────────

function calcomHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function calcomFetchSlots(
  s: Settings,
  datum?: string,
): Promise<{ start: string; end: string }[]> {
  "use step";

  const startDate = datum ?? new Date().toISOString().slice(0, 10);
  const endDate = new Date(
    new Date(`${startDate}T00:00:00Z`).getTime() + 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    eventTypeId: s.calcomEventTypeId,
    start: startDate,
    end: endDate,
  });
  const res = await fetch(`${s.calcomBaseUrl}/v2/slots?${params}`, {
    headers: calcomHeaders(s.calcomApiKey),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`Cal.com Auth-Fehler ${res.status}`);
    }
    throw new Error(`Cal.com slots fehlgeschlagen: ${res.status}`);
  }
  const json = await res.json();
  const slots: { start: string; end: string }[] = [];
  for (const day of Object.values(json.data ?? {}) as any[]) {
    for (const slot of day as any[]) {
      slots.push({ start: slot.start, end: slot.end ?? slot.start });
    }
  }
  return slots;
}

async function calcomCreateBooking(
  s: Settings,
  lead: Lead,
  slotStart: string,
): Promise<{ bookingId?: string; conflict?: boolean }> {
  "use step";

  const res = await fetch(`${s.calcomBaseUrl}/v2/bookings`, {
    method: "POST",
    headers: calcomHeaders(s.calcomApiKey),
    body: JSON.stringify({
      eventTypeId: Number(s.calcomEventTypeId),
      start: slotStart,
      attendee: {
        name: lead.displayName,
        email: "no-reply@energy-callcenter.local",
        timeZone: s.timezone,
        phoneNumber: lead.phone,
      },
    }),
  });
  if (res.status === 409) {
    return { conflict: true };
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FatalError(`Cal.com Auth-Fehler ${res.status}`);
    }
    const text = await res.text();
    throw new Error(`Cal.com booking fehlgeschlagen ${res.status}: ${text}`);
  }
  const json = await res.json();
  return { bookingId: String(json.data?.id ?? json.data?.uid ?? "") };
}

// ─────────────────────────────────────────────
// Error-Report (Step)
// ─────────────────────────────────────────────

async function errorReport(
  apiKey: string,
  userId: string,
  stepName: string,
  error: unknown,
  leadId?: string,
): Promise<void> {
  "use step";

  const message = redact(
    error instanceof Error ? error.message : String(error),
  );
  console.error(`[energy] ${stepName}: ${message}`);
  try {
    if (leadId) {
      await closeLogNote(apiKey, leadId, `Energy Error in ${stepName}: ${message}`);
      await closeCreateTask(
        apiKey,
        leadId,
        userId,
        `Energy Error in ${stepName}: ${message}`,
      );
    }
  } catch (reportError) {
    console.error(
      `[energy] errorReport fehlgeschlagen:`,
      reportError instanceof Error ? reportError.message : reportError,
    );
  }
}

// ─────────────────────────────────────────────
// Workflow: energyDispatch (Minuten-Cron)
// ─────────────────────────────────────────────

export async function energyDispatch(): Promise<{ dispatched: boolean; leadId?: string; reason?: string }> {
  "use workflow";

  const s = await loadSettings();

  if (!isInCallWindow(s)) {
    return { dispatched: false, reason: "outside_call_window" };
  }

  // Reconciliation: verwaiste Anrufe beenden
  const busyLeads = await closeSearchLeads(s.closeApiKey, {
    query: [
      {
        type: "or",
        queries: [
          { type: "field_condition", field: { custom_field: CF.callStatus, type: "text" }, condition: { type: "eq", value: "dialing" } },
          { type: "field_condition", field: { custom_field: CF.callStatus, type: "text" }, condition: { type: "eq", value: "active" } },
        ],
      },
    ],
  }, s.maxConcurrentCalls + 10);
  const roomNames = await livekitListRoomNames(s);
  for (const lead of busyLeads) {
    if (lead.livekitRoom && !roomNames.includes(lead.livekitRoom)) {
      await closeUpdateLead(s.closeApiKey, lead.id, {
        [CF.callStatus]: "ended",
      });
      await kvReleaseLead(lead.id);
    }
  }

  // Kapazität
  const activeCount = busyLeads.filter(
    (l) => l.livekitRoom && roomNames.includes(l.livekitRoom),
  ).length;
  if (activeCount >= s.maxConcurrentCalls) {
    return { dispatched: false, reason: "capacity_reached" };
  }

  // Nächsten Lead wählen
  const nowIso = new Date().toISOString();
  const candidates = await closeSearchLeads(s.closeApiKey, {
    query: [
      {
        type: "or",
        queries: [
          { type: "field_condition", field: { custom_field: CF.callStatus, type: "text" }, condition: { type: "eq", value: "ready" } },
          {
            type: "and",
            queries: [
              { type: "field_condition", field: { custom_field: CF.callStatus, type: "text" }, condition: { type: "eq", value: "retry" } },
              { type: "field_condition", field: { custom_field: CF.holdUntil, type: "datetime" }, condition: { type: "lt", value: nowIso } },
            ],
          },
        ],
      },
    ],
  }, 25);
  const lead = candidates
    .filter((l) => !l.doNotCall && l.callAttempts < s.maxAttemptsPerDay && l.phone)
    .sort((a, b) => a.dateCreated.localeCompare(b.dateCreated))[0];

  if (!lead) {
    return { dispatched: false, reason: "no_lead_ready" };
  }

  // Atomar reservieren
  const claimId = crypto.randomUUID();
  const claimed = await kvClaimLead(lead.id, claimId, s.lockTtlSeconds);
  if (!claimed) {
    return { dispatched: false, reason: "claim_conflict", leadId: lead.id };
  }

  // Anruf starten
  const roomName = `energy-${lead.id}-${Date.now()}`;
  try {
    await livekitDispatchAgent(s, roomName);
    await livekitCallPhone(s, roomName, lead.phone);
  } catch (error) {
    const holdUntil = new Date(
      Date.now() + s.retryWaitMinutes * 60000,
    ).toISOString();
    await closeUpdateLead(s.closeApiKey, lead.id, {
      [CF.callStatus]: "retry",
      [CF.callAttempts]: lead.callAttempts + 1,
      [CF.holdUntil]: holdUntil,
    });
    await closeLogNote(
      s.closeApiKey,
      lead.id,
      `call_start_error: ${redact(error instanceof Error ? error.message : String(error))}`,
    );
    await kvReleaseLead(lead.id);
    if (error instanceof FatalError) throw error;
    return { dispatched: false, reason: "call_start_error", leadId: lead.id };
  }

  await closeUpdateLead(s.closeApiKey, lead.id, {
    [CF.callStatus]: "dialing",
    [CF.livekitRoom]: roomName,
    [CF.claimId]: claimId,
  });
  await closeLogNote(s.closeApiKey, lead.id, `call_dispatched: room=${roomName}`);

  return { dispatched: true, leadId: lead.id };
}

// ─────────────────────────────────────────────
// Workflow: energyGetKunde
// ─────────────────────────────────────────────

export async function energyGetKunde(input: {
  call_id?: string;
  phone?: string;
}): Promise<Record<string, unknown>> {
  "use workflow";

  const s = await loadSettings();

  let lead: Lead | null = null;
  if (input.call_id) {
    lead = await closeFetchLead(s.closeApiKey, input.call_id);
  }
  if (!lead && input.phone) {
    const matches = await closeSearchLeads(
      s.closeApiKey,
      { query: [{ type: "field_condition", field: { type: "contact_phones" }, condition: { type: "eq", value: input.phone } }] },
      1,
    );
    lead = matches[0] ?? null;
  }
  if (!lead) {
    return { found: false };
  }

  if (lead.callStatus === "dialing") {
    await closeUpdateLead(s.closeApiKey, lead.id, { [CF.callStatus]: "active" });
  }

  return {
    found: true,
    lead_id: lead.id,
    name: lead.displayName,
    phone: lead.phone,
    call_attempts: lead.callAttempts,
    call_outcome: lead.callOutcome,
  };
}

// ─────────────────────────────────────────────
// Workflow: energyGetTermine
// ─────────────────────────────────────────────

export async function energyGetTermine(input: {
  datum?: string;
}): Promise<{ slots: { start: string; end: string }[] }> {
  "use workflow";

  const s = await loadSettings();
  const slots = await calcomFetchSlots(s, input.datum);
  return { slots };
}

// ─────────────────────────────────────────────
// Workflow: energyBookTermin
// ─────────────────────────────────────────────

export async function energyBookTermin(input: {
  lead_id: string;
  slot_start: string;
}): Promise<Record<string, unknown>> {
  "use workflow";

  const s = await loadSettings();
  const lead = await closeFetchLead(s.closeApiKey, input.lead_id);
  if (!lead) {
    return { booked: false, error: "lead_not_found" };
  }

  const result = await calcomCreateBooking(s, lead, input.slot_start);

  if (result.conflict) {
    return {
      booked: true,
      idempotent: true,
      note: "Slot bereits gebucht (409) — als Erfolg behandelt",
    };
  }

  await closeUpdateLead(s.closeApiKey, lead.id, {
    [CF.callOutcome]: "termin",
    status_id: s.closeStatus.qualified,
  });
  await closeLogNote(
    s.closeApiKey,
    lead.id,
    `appointment_booked: ${input.slot_start} (booking ${result.bookingId})`,
  );

  return { booked: true, booking_id: result.bookingId };
}

// ─────────────────────────────────────────────
// Workflow: energyCallResult
// ─────────────────────────────────────────────

export async function energyCallResult(input: {
  lead_id: string;
  outcome: CallOutcome;
  do_not_call?: boolean;
}): Promise<Record<string, unknown>> {
  "use workflow";

  const s = await loadSettings();
  const lead = await closeFetchLead(s.closeApiKey, input.lead_id);
  if (!lead) {
    return { processed: false, error: "lead_not_found" };
  }

  const attempts = lead.callAttempts + 1;
  const updates: Record<string, unknown> = {
    [CF.callAttempts]: attempts,
    [CF.callOutcome]: input.outcome,
  };

  if (input.do_not_call === true) {
    updates[CF.doNotCall] = "yes";
    updates[CF.callStatus] = "dnc_skip";
  } else {
    switch (input.outcome) {
      case "termin":
        updates.status_id = s.closeStatus.qualified;
        updates[CF.callStatus] = "ended";
        if (lead.callOutcome !== "termin") {
          await closeCreateTask(
            s.closeApiKey,
            lead.id,
            s.closeUserId,
            "Energy: outcome 'termin' ohne vorherige Buchung — bitte prüfen",
          );
        }
        break;
      case "interessiert":
        updates.status_id = s.closeStatus.interested;
        updates[CF.callStatus] = "ended";
        break;
      case "abgelehnt":
        updates.status_id = s.closeStatus.notInterested;
        updates[CF.callStatus] = "ended";
        break;
      case "mailbox":
      case "keine_antwort":
        updates[CF.callStatus] = "retry";
        updates[CF.holdUntil] = new Date(
          Date.now() + s.retryWaitMinutes * 60000,
        ).toISOString();
        break;
    }
  }

  await closeUpdateLead(s.closeApiKey, lead.id, updates);
  await closeLogCall(s.closeApiKey, lead.id, {
    note: `call_result: ${input.outcome}${input.do_not_call ? " (do_not_call)" : ""}`,
    status: "completed",
    direction: "outbound",
  });

  return { processed: true, outcome: input.outcome, call_attempts: attempts };
}

// ─────────────────────────────────────────────
// Workflow: energyRoomFinished
// ─────────────────────────────────────────────

export async function energyRoomFinished(input: {
  room: string;
}): Promise<Record<string, unknown>> {
  "use workflow";

  const s = await loadSettings();

  const matches = await closeSearchLeads(
    s.closeApiKey,
    { query: [{ type: "field_condition", field: { custom_field: CF.livekitRoom, type: "text" }, condition: { type: "eq", value: input.room } }] },
    1,
  );
  const lead = matches[0];
  if (!lead) {
    return { handled: false, reason: "lead_not_found" };
  }

  let action = "none";
  if (lead.callStatus === "dialing") {
    await closeUpdateLead(s.closeApiKey, lead.id, {
      [CF.callStatus]: "retry",
      [CF.holdUntil]: new Date(
        Date.now() + s.retryWaitMinutes * 60000,
      ).toISOString(),
    });
    action = "retry_agent_never_joined";
  } else if (lead.callStatus === "active" && !lead.callOutcome) {
    await closeUpdateLead(s.closeApiKey, lead.id, {
      [CF.callStatus]: "needs_review",
    });
    await closeCreateTask(
      s.closeApiKey,
      lead.id,
      s.closeUserId,
      "Energy: Gespräch beendet ohne call-result — bitte nachfassen",
    );
    action = "needs_review";
  } else if (lead.callStatus === "active") {
    await closeUpdateLead(s.closeApiKey, lead.id, {
      [CF.callStatus]: "ended",
    });
    action = "ended";
  }

  await kvReleaseLead(lead.id);

  if (action === "retry_agent_never_joined") {
    await start(energyDispatch, []);
  }

  return { handled: true, lead_id: lead.id, action };
}
