const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

function getAuth() {
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
}

app.get("/", (req, res) => res.send("OK"));

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.send("no event");

    const text = event.message.text.trim();
    const [action, stock, price, qty] = text.split(" ");

    const auth = getAuth();
    await auth.authorize();

    const sheets = google.sheets({ version: "v4", auth });

    // =========================
    // 1️⃣ 寫入交易紀錄
    // =========================
    await sheets.spreadsheets.values.append({
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

    // =========================
    // 2️⃣ 讀取所有交易資料
    // =========================
    const all = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:E"
    });

    const rows = all.data.values || [];

    const positions = {};

    for (const row of rows) {
      const s = row[1];
      const a = row[2];
      const q = Number(row[4]);

      if (!s || !a || isNaN(q)) continue;

      if (!positions[s]) positions[s] = 0;

      if (a === "買") {
        positions[s] += q;
      } else if (a === "賣") {
        positions[s] -= q;
      }
    }

    // =========================
    // 3️⃣ 清空 positions sheet
    // =========================
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: "positions!A:B"
    });

    // =========================
    // 4️⃣ 寫入最新持股
    // =========================
    const result = Object.entries(positions).map(([stock, qty]) => [
      stock,
      qty
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "positions!A:B",
      valueInputOption: "RAW",
      requestBody: {
        values: result
      }
    });

    console.log("✅ POSITIONS UPDATED:", positions);

    res.send("ok");

  } catch (err) {
    console.error(err);
    res.send("error");
  }
});

module.exports = app;
