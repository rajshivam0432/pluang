
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const hrDataPath = path.join(__dirname, "../data/hrData.json");
const leavesPath = path.join(__dirname, "../data/leaves.json");

if (!fs.existsSync(leavesPath)) fs.writeFileSync(leavesPath, "[]");

const hrData = JSON.parse(fs.readFileSync(hrDataPath, "utf8"));

const sessions = {};

const getLeaves = () => JSON.parse(fs.readFileSync(leavesPath, "utf8"));
const saveLeaves = (data) =>
  fs.writeFileSync(leavesPath, JSON.stringify(data, null, 2));

router.post("/", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId)
    return res.status(400).json({ error: "Missing message or sessionId" });

  const lower = message.toLowerCase();
  sessions[sessionId] ??= { context: "", lastTopic: "", lastAIMessage: "" };

  try {
    if (lower.includes("when") && lower.includes("sick leave")) {
      const leaves = getLeaves().filter(
        (l) => l.sessionId === sessionId && l.type === "sick"
      );
      if (leaves.length === 0)
        return res.json({
          response:
            "You haven't applied for any sick leave yet in this session.",
        });

      const list = leaves.map((l) => l.date).join(", ");
      return res.json({
        response: `You have applied sick leave on ${list}.`,
      });
    }

    if (lower.includes("apply") && lower.includes("leave")) {
      const type = lower.includes("sick")
        ? "sick"
        : lower.includes("casual")
        ? "casual"
        : "unspecified";

      const dateMatch = message.match(
        /\b(\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i
      );
      const date = dateMatch ? dateMatch[1] : null;

      if (!date) {
        sessions[sessionId].context = "awaiting_leave_date";
        sessions[sessionId].lastTopic = "leave";
        return res.json({
          response:
            "Please specify the date you want to take the leave. For example, 'Apply sick leave for Feb 5'.",
        });
      }

      const leaves = getLeaves();
      leaves.push({
        sessionId,
        type,
        date,
        createdAt: new Date().toISOString(),
      });
      saveLeaves(leaves);

      sessions[sessionId].context = "leave_applied";
      sessions[sessionId].lastTopic = "leave";

      return res.json({
        response: `✅ Your ${type} leave for ${date} has been noted.`,
      });
    }

    if (sessions[sessionId].context === "awaiting_leave_date") {
      const dateMatch = message.match(
        /\b(\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i
      );
      if (!dateMatch) {
        return res.json({
          response:
            "Sorry, I didn’t catch the date. Please say something like 'Feb 5' or 'February 5th'.",
        });
      }

      const date = dateMatch[1];
      const leaves = getLeaves();
      leaves.push({
        sessionId,
        type: "unspecified",
        date,
        createdAt: new Date().toISOString(),
      });
      saveLeaves(leaves);

      sessions[sessionId].context = "leave_applied";
      sessions[sessionId].lastTopic = "leave";

      return res.json({
        response: `✅ Noted! Your leave for ${date} has been applied.`,
      });
    }

    if (
      /\b(repeat|say that again|same line|again|repeat that)\b/i.test(lower) &&
      sessions[sessionId].lastAIMessage
    ) {
      return res.json({
        response: sessions[sessionId].lastAIMessage,
      });
    }

    const possibleTopics = ["leave", "holiday", "benefit", "policy", "hours"];
    for (const t of possibleTopics) {
      if (lower.includes(t)) {
        sessions[sessionId].lastTopic = t;
        break;
      }
    }

    const vagueFollowup = /\b(any more|tell me more|what else|more info)\b/i.test(
      lower
    );
    const numberFollowup = /\b(1st|first|2nd|second|3rd|third|4th|fourth)\b/i.test(
      lower
    );

    let userQuery = message;
    if (vagueFollowup && sessions[sessionId].lastTopic) {
      userQuery = `Give me more details about ${sessions[sessionId].lastTopic}.`;
    } else if (numberFollowup && sessions[sessionId].lastAIMessage) {
      userQuery = `The user said "${message}". Based on the previous AI message: "${sessions[sessionId].lastAIMessage}", determine which option they meant and continue accordingly.`;
    }

    const prompt = `
You are "HR Buddy" — a polite, conversational HR assistant.

Use this HR information as your source of truth:
${JSON.stringify(hrData, null, 2)}

Conversation context:
- Last topic: ${sessions[sessionId].lastTopic || "none"}
- Last user message: ${sessions[sessionId].context || "none"}
- Last AI message: ${sessions[sessionId].lastAIMessage || "none"}

User message: ${userQuery}

Guidelines:
- If the user says "1st one", "second", or "3rd one", infer which option from the previous AI message they meant.
- If vague ("any more", "tell me more", "what else"), elaborate naturally on the last discussed topic.
- If user asks to "repeat", reuse last response.
- Always be friendly, concise, and clear.
`;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await axios.post(
      GEMINI_URL,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const reply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn’t find that information.";

    // Update session memory
    sessions[sessionId].context = message;
    sessions[sessionId].lastAIMessage = reply;

    res.json({ response: reply });
  } catch (err) {
    console.error("Gemini HR Buddy Error:", err.response?.data || err.message);
    res
      .status(500)
      .json({ error: "Something went wrong with the HR Buddy service." });
  }
});

export default router;

