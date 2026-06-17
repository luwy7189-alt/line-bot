const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

// =========================
// Google Sheet ID
// =========================
const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

// =========================
// Google Auth
// =========================
function getAuth() {
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

// =========================
// Health Check
// =========================
app.get("/", (req, res) => {
  res.send("OK");
});

// =========================
// LINE Webhook
// =========================
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔥 WEBHOOK HIT");
    console.log(JSON.stringify(req.body, null, 2));

    const events = req.body.events;

    if (!events || events.length === 0) {
      console.log("⚠️ NO EVENTS");
      return res.status(200).send("no event");
    }

    const event = events[0];

    if (event.type !== "message") {
      console.log("⚠️ NOT MESSAGE EVENT:", event.type);
      return res.status(200).send("not message");
    }

    const text = event.message.text;
    console.log("💬 MESSAGE:", text);

    // =========================
    // 解析：買 2330 580 10
    // =========================
    const parts = text.trim().split(" ");

    if (parts.length < 4) {
      console.log("❌ FORMAT ERROR");
      return res.status(200).send("format error");
    }

    const action = parts[0];
    const stock = parts[1];
    const price = parts[2];
    const qty = parts[3];

    // =========================
    // Debug Info
    // =========================
    console.log("📊 PARSED DATA:", {
      action,
      stock,
      price,
      qty
    });

    console.log("🔑 CLIENT EMAIL:", process.env.GOOGLE_CLIENT_EMAIL);

    // =========================
    // Google Sheets
    // =========================
    const auth = getAuth();
    await auth.authorize();

    console.log("🔐 GOOGLE AUTH OK");

    const sheets = google.sheets({ version: "v4", auth });

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          new Date().toLocaleString("zh-TW"),
          stock,
          action,
          price,
          qty
        ]]
      }
    });

    console.log("✅ GOOGLE WRITE SUCCESS");
    console.log(JSON.stringify(result.data, null, 2));

    return res.status(200).send("ok");

  } catch (err) {
    console.error("❌ GOOGLE ERROR FULL:");
    console.error(err.response?.data || err.message || err);

    return res.status(200).send("error");
  }
});

module.exports = app;
