const express = require("express");
const { google } = require("googleapis");
const axios = require("axios");

const app = express();
app.use(express.json());

const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

// =========================
// LINE TOKEN
// =========================
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

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
// Yahoo 股價
// =========================
async function getPrice(stock) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stock}.TW`;
    const res = await axios.get(url);
    return res.data.quoteResponse.result?.[0]?.regularMarketPrice || 0;
  } catch (e) {
    return 0;
  }
}

// =========================
// LINE Reply
// =========================
async function replyMessage(replyToken, text) {
  console.log("🔑 LINE TOKEN EXISTS:", !!LINE_TOKEN);

  if (!LINE_TOKEN) {
    console.log("❌ LINE TOKEN MISSING");
    return;
  }

  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [
        {
          type: "text",
          text: String(text).slice(0, 1900)
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`
      }
    }
  );
}

app.get("/", (req, res) => res.send("OK"));

// =========================
// Webhook
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];

    if (!event) {
      console.log("❌ NO EVENT");
      return res.send("no event");
    }

    const replyToken = event.replyToken;
    const rawText = event.message?.text || "";
    const text = rawText.trim();

    console.log("🔥 RAW:", JSON.stringify(rawText));
    console.log("🔥 TEXT:", JSON.stringify(text));
    console.log("👉 REPLY TOKEN:", replyToken);

    const auth = getAuth();
    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // =====================================================
    // 📊 查持股（不寫入）
    // =====================================================
    if (text.includes("持股")) {
      console.log("📊 HOLDINGS TRIGGERED");

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

      await replyMessage(replyToken, reply);
      return res.send("ok");
    }

    // =====================================================
    // 📌 交易解析
    // =====================================================
    const parts = text.split(" ");

    console.log("📌 PARTS:", parts);

    if (parts.length < 4) {
      console.log("❌ FORMAT ERROR");
      await replyMessage(replyToken, "格式錯誤：買/賣 股票 價格 股數");
      return res.send("format error");
    }

    const [action, stock, priceStr, qtyStr] = parts;

    const price = Number(priceStr);
    const qty = Number(qtyStr);

    if (!action || !stock || isNaN(price) || isNaN(qty)) {
      await replyMessage(replyToken, "資料錯誤");
      return res.send("bad format");
    }

    console.log("📌 TRADE:", { action, stock, price, qty });

    // =====================================================
    // 📌 寫入交易 Sheet1
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
    // 📌 重算 positions
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
    // 📌 更新 positions（保留標題）
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

    await replyMessage(replyToken, "✅ 已更新持股");

    console.log("✅ DONE");

    return res.send("ok");

  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.send("error");
  }
});

module.exports = app;
