const express = require("express");
const { google } = require("googleapis");
const axios = require("axios");

const app = express();
app.use(express.json());

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
// 即時股價（Yahoo Finance）
// =========================
async function getPrice(stock) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stock}.TW`;
    const res = await axios.get(url);
    return res.data.quoteResponse.result[0].regularMarketPrice || 0;
  } catch (e) {
    return 0;
  }
}

app.get("/", (req, res) => res.send("OK"));

// =========================
// Webhook
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event) return res.send("no event");

    const text = (event.message?.text || "").trim();
    console.log("🔥 MESSAGE:", text);

    const auth = getAuth();
    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // =====================================================
    // 📌 1️⃣ 查持股（不寫入 Sheet）
    // =====================================================
    if (text === "持股") {
      console.log("📊 查持股");

      const all = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "positions!A:C"
      });

      const rows = all.data.values || [];

      let reply = "📊 持股報表\n\n";

      for (const r of rows) {
        const stock = r[0];
        const qty = Number(r[1]);
        const cost = Number(r[2]);

        if (!stock || isNaN(qty)) continue;

        const price = await getPrice(stock);
        const profit = (price - cost) * qty;

        reply += `${stock}
持股：${qty}
成本：${cost}
現價：${price}
損益：${profit.toFixed(0)}\n\n`;
      }

      console.log(reply);
      return res.send("ok");
    }

    // =====================================================
    // 📌 2️⃣ 交易指令（買 / 賣）
    // =====================================================
    const parts = text.split(" ");

    if (parts.length < 4) {
      console.log("❌ format error:", parts);
      return res.send("format error");
    }

    const [action, stock, priceStr, qtyStr] = parts;

    const price = Number(priceStr);
    const qty = Number(qtyStr);

    // 防呆
    if (!action || !stock || isNaN(price) || isNaN(qty)) {
      return res.send("bad format");
    }

    console.log("📌 TRADE:", { action, stock, price, qty });

    // =====================================================
    // 📌 3️⃣ 寫入交易紀錄 Sheet1
    // =====================================================
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

    // =====================================================
    // 📌 4️⃣ 重新計算 positions
    // =====================================================
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
        data[s] = { qty: 0, cost: 0 };
      }

      if (a === "買") {
        data[s].qty += q;
        data[s].cost += p * q;
      }

      if (a === "賣") {
        const avg = data[s].qty === 0 ? 0 : data[s].cost / data[s].qty;
        data[s].qty -= q;
        data[s].cost -= avg * q;
      }
    }

    // =====================================================
    // 📌 5️⃣ 更新 positions（只清資料，不動標題）
    // =====================================================
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: "positions!A2:C"
    });

    const output = Object.entries(data)
      .filter(([_, v]) => v.qty > 0)
      .map(([stock, v]) => [
        stock,
        v.qty,
        (v.qty === 0 ? 0 : v.cost / v.qty).toFixed(2)
      ]);

    if (output.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "positions!A2:C",
        valueInputOption: "RAW",
        requestBody: {
          values: output
        }
      });
    }

    console.log("✅ UPDATED POSITIONS");

    return res.send("ok");

  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.send("error");
  }
});

module.exports = app;
