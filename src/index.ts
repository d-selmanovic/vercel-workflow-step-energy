import express from "express";
import { start } from "workflow/api";
import { handleUserSignup } from "../workflows/user-signup.js";

const app = express();
app.use(express.json());

app.post("/api/signup", async (req, res) => {
  const { email } = req.body;
  await start(handleUserSignup, [email]);
  return res.json({ message: "User signup workflow started" });
});

export default app;
