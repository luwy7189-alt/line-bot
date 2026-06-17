const express = require("express");

const app = express();

// 👉 讓 Vercel / LINE 能正常解析 JSON
app.use(express.json());

// =========================
// Health Check
// =========================
app.get("/", (req, res) => {
  res.send("OK");
});

// =========================
// LINE Webhook
// =========================
app.post("/webhook", (req, res) => {
  try {
    console.log("🔥 LINE WEBHOOK HIT");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    const events = req.body.events;

    if (!events || events.length === 0) {
      console.log("⚠️ No events received");
      return res.status(200).send("no event");
    }

    // 取第一個 event（先簡化測試）
    const event = events[0];

    console.log("EVENT TYPE:", event.type);

    if (event.type === "message") {
      const msg = event.message?.text;
      console.log("MESSAGE:", msg);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("❌ ERROR:", error);
    return res.status(200).send("error");
  }
});

module.exports = app;
