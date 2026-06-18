const express = require("express");
const { google } = require("googleapis");
const axios = require("axios");

const app = express();
app.use(express.json());

const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

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
  } catch {
    return 0;
  }
}

// =========================
// LINE reply
// =========================
async function reply(replyToken, text) {
  if (!LINE_TOKEN) return;

  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text: String(text).slice(0, 1900) }]
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
    if (!event) return res.send("no event");

    const text = (event.message?.text || "").trim();
    const replyToken = event.replyToken;

    const auth = getAuth();
    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // =====================================================
    // 🚨 1. 持股（一定要最先判斷）
    // =====================================================
    if (text.includes("持股")) {

      const all = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "Sheet1!A:E"
      });

      const rows = all.data.values || [];

      const data = {};

      for (const row of rows) {
        const stock = row[1];
        const action = row[2];
        const price = Number(row[3]);
        const qty = Number(row[4]);

        if (!stock || !action || isNaN(qty)) continue;

        if (!data[stock]) data[stock] = { qty: 0, cost: 0 };

        if (action === "買") {
          data[stock].qty += qty;
          data[stock].cost += price * qty;
        }

        if (action === "賣") {
          const avg = data[stock].qty > 0 ? data[stock].cost / data[stock].qty : 0;
          const sellQty = Math.min(qty, data[stock].qty);
          data[stock].qty -= sellQty;
          data[stock].cost -= avg * sellQty;
        }
      }

      let msg = "📊 持股報表\n\n";

      for (const s in data) {
        const qty = data[s].qty;
        if (qty <= 0) continue;

        const avgCost = data[s].cost / qty;
        const price = await getPrice(s);
        const profit = (price - avgCost) * qty;

        msg += `${s}
股數：${qty}
成本：${avgCost.toFixed(2)}
市價：${price}
損益：${profit.toFixed(0)}\n\n`;
      }

      await reply(replyToken, msg);
      return res.send("ok");
    }

    // =====================================================
    // 📊 2. 個股查詢（2330）
    // =====================================================
    if (/^\d{4}$/.test(text)) {

      const stock = text;

      const all = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "Sheet1!A:E"
      });

      const rows = all.data.values || [];

      let qty = 0;
      let cost = 0;

      for (const row of rows) {
        const s = row[1];
        const action = row[2];
        const price = Number(row[3]);
        const q = Number(row[4]);

        if (s !== stock || isNaN(q)) continue;

        if (action === "買") {
          qty += q;
          cost += price * q;
        }

        if (action === "賣") {
          const avg = qty > 0 ? cost / qty : 0;
          const sellQty = Math.min(q, qty);
          qty -= sellQty;
          cost -= avg * sellQty;
        }
      }

      if (qty <= 0) {
        await reply(replyToken, "查無持股");
        return res.send("ok");
      }

      const avgCost = cost / qty;
      const price = await getPrice(stock);
      const profit = (price - avgCost) * qty;

      const nameMap = {
        "2330": "台積電",
        "2317": "鴻海",
        "2454": "聯發科",
        "2303": "聯電",
        "2412": "中華電"
      };

      const name = nameMap[stock] || "未知股票";

      const msg =
`📊 個股明細

代碼：${stock}
名稱：${name}
股數：${qty}
成本：${avgCost.toFixed(2)}
市價：${price}
損益：${profit.toFixed(0)}`;

      await reply(replyToken, msg);
      return res.send("ok");
    }

    // =====================================================
    // 💰 3. 交易（最後才處理）
    // =====================================================
    const parts = text.split(" ");

    if (parts.length < 4) {
      await reply(replyToken, "格式: 買/賣 股票 價格 股數");
      return res.send("bad");
    }

    const [action, stock, priceStr, qtyStr] = parts;

    const price = Number(priceStr);
    const qty = Number(qtyStr);

    if (!action || !stock || isNaN(price) || isNaN(qty)) {
      await reply(replyToken, "資料錯誤");
      return res.send("bad");
    }

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

    await reply(replyToken, "✅ 已記錄交易");
    return res.send("ok");

  } catch (err) {
    console.error(err);
    return res.send("error");
  }
});

module.exports = app;
