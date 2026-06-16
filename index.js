const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

// 👉 你的 Google Sheet ID
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
    console.log("=== webhook received ===");

    const event = req.body.events?.[0];

    if (!event || event.type !== "message") {
      console.log("no event");
      return res.status(200).send("no event");
    }

    const text = event.message.text;
    console.log("message:", text);

    const parts = text.split(" ");

    const action = parts[0]; // 買 / 賣
    const stock = parts[1];  // 股票代號
    const price = parts[2];  // 價格
    const qty = parts[3];    // 數量

    // =========================
    // Google Sheets API
    // =========================
    const auth = getAuth();
    await auth.authorize();
    console.log("auth OK");

    const sheets = google.sheets({ version: "v4", auth });

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          new Date().toISOString(),
          stock,
          action,
          price,
          qty
        ]]
      }
    });

    console.log("WRITE STATUS:", result.status);

    return res.status(200).send("ok");

  } catch (err) {
    console.error("FULL ERROR:", err);
    return res.status(200).send("error");
  }
});

// =========================
module.exports = app;
