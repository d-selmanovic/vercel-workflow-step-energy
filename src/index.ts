import express from "express";
import { start } from "workflow/api";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleUserSignup } from "../workflows/user-signup.js";
import {
  energyBookTermin,
  energyCallResult,
  energyDispatch,
  energyGetKunde,
  energyGetTermine,
  energyRoomFinished,
} from "../workflows/energy.js";

const app = express();

// ─────────────────────────────────────────────
// LiveKit-Webhook (rawBody für Signatur-Hash)
// ─────────────────────────────────────────────

function b64urlDecode(input: string): Buffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function verifyLivekitJwt(
  token: string,
  secret: string,
  rawBody: Buffer,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expectedSig = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const actualSig = b64urlDecode(parts[2]);
  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
  const exp = Number(payload.exp ?? 0);
  if (exp < Math.floor(Date.now() / 1000)) return null;

  const bodyHash = createHmac("sha256", rawBody)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sha256 = payload.sha256 as string | undefined;
  if (
    sha256 &&
    !timingSafeEqual(Buffer.from(sha256), Buffer.from(bodyHash))
  ) {
    return null;
  }
  return payload;
}

app.post(
  "/webhooks/livekit",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    const secret = process.env.LIVEKIT_WEBHOOK_SECRET;
    const auth = req.headers.authorization;
    if (!secret || !auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body ?? ""));
    const payload = verifyLivekitJwt(auth.slice(7), secret, rawBody);
    if (!payload) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    let event: { event?: string; room?: { name?: string } };
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid body" });
    }

    if (event.event === "room_finished" && event.room?.name) {
      await start(energyRoomFinished, [{ room: event.room.name }]);
    }
    return res.status(200).json({ received: true });
  },
);

// ─────────────────────────────────────────────
// JSON-Endpunkte
// ─────────────────────────────────────────────

app.use(express.json());

function requireAgentSecret(
  req: express.Request,
  res: express.Response,
): boolean {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

app.post("/api/signup", async (req, res) => {
  const { email } = req.body;
  await start(handleUserSignup, [email]);
  return res.json({ message: "User signup workflow started" });
});

app.post("/api/dispatch", async (_req, res) => {
  await start(energyDispatch, []);
  return res.status(202).json({ message: "Dispatch workflow started" });
});

app.post("/agent/get-kunde", async (req, res) => {
  if (!requireAgentSecret(req, res)) return;
  const { call_id, phone } = req.body ?? {};
  if (!call_id && !phone) {
    return res.status(400).json({ error: "call_id oder phone erforderlich" });
  }
  await start(energyGetKunde, [{ call_id, phone }]);
  return res.status(202).json({ message: "get-kunde workflow started" });
});

app.post("/agent/get-termine", async (req, res) => {
  if (!requireAgentSecret(req, res)) return;
  const { datum } = req.body ?? {};
  await start(energyGetTermine, [{ datum }]);
  return res.status(202).json({ message: "get-termine workflow started" });
});

app.post("/agent/book-termin", async (req, res) => {
  if (!requireAgentSecret(req, res)) return;
  const { lead_id, slot_start, dauer } = req.body ?? {};
  if (!lead_id || !slot_start) {
    return res
      .status(400)
      .json({ error: "lead_id und slot_start erforderlich" });
  }
  await start(energyBookTermin, [{ lead_id, slot_start, dauer }]);
  return res.status(202).json({ message: "book-termin workflow started" });
});

app.post("/agent/call-result", async (req, res) => {
  if (!requireAgentSecret(req, res)) return;
  const { lead_id, outcome, do_not_call } = req.body ?? {};
  const validOutcomes = [
    "termin",
    "interessiert",
    "abgelehnt",
    "mailbox",
    "keine_antwort",
  ];
  if (!lead_id || !validOutcomes.includes(outcome)) {
    return res.status(400).json({
      error: `lead_id und gültiges outcome erforderlich (${validOutcomes.join(", ")})`,
    });
  }
  await start(energyCallResult, [{ lead_id, outcome, do_not_call }]);
  return res.status(202).json({ message: "call-result workflow started" });
});

export default app;
