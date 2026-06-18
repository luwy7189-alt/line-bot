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

    const [action, stock, priceStr, qtyStr] = event.message.text.trim().split(" ");
    const price = Number(priceStr);
    const qty = Number(qtyStr);

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
    // 2️⃣ 讀全部交易
    // =========================
    const all = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:E"
    });

    const rows = all.data.values || [];

    const data = {};

    for (const row of rows) {
      const s = row[1];
      const a = row[2];
      const p = Number(row[3]);
      const q = Number(row[4]);

      if (!s || !a || isNaN(q)) continue;

      if (!data[s]) {
        data[s] = {
          qty: 0,
          cost: 0
        };
      }

      if (a === "買") {
        data[s].cost += p * q;
        data[s].qty += q;
      }

      if (a === "賣") {
        // 賣出用平均成本扣
        const avg = data[s].qty === 0 ? 0 : data[s].cost / data[s].qty;

        data[s].cost -= avg * q;
        data[s].qty -= q;
      }
    }

    // =========================
    // 3️⃣ 寫入 positions + cost
    // =========================
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: "positions!A:C"
    });

    const result = Object.entries(data).map(([stock, v]) => {
      const avgCost = v.qty === 0 ? 0 : (v.cost / v.qty).toFixed(2);

      return [
        stock,
        v.qty,
        avgCost
      ];
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "positions!A:C",
      valueInputOption: "RAW",
      requestBody: {
        values: result
      }
    });

    console.log("✅ UPDATED:", data);

    res.send("ok");

  } catch (err) {
    console.error(err);
    res.send("error");
  }
});

module.exports = app;
