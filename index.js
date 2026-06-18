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

    const res = await axios.get(url, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const result = res.data?.quoteResponse?.result?.[0];
    return result?.regularMarketPrice || 0;

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
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// =========================
// CLEAN TEXT（🔥關鍵修復）
// =========================
function cleanText(t) {
  return (t || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // invisible char
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
}

app.get("/", (req, res) => res.send("OK"));

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event) return res.send("no event");

    let text = cleanText(event.message?.text);
    const replyToken = event.replyToken;

    console.log("📩 INPUT:", text);

    const auth = getAuth();
    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // =====================================================
    // 📊 持股（多種輸入都支援）
    // =====================================================
    if (
      text === "持股" ||
      text === "我的持股" ||
      text === "持股報表" ||
      text.includes("持股")
    ) {
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
        if (!qty || qty <= 0) continue;

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
    // 📊 總覽
    // =====================================================
    if (
      text === "總覽" ||
      text === "總攬" ||
      text.includes("總覽") ||
      text.includes("總攬")
    ) {
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

      let totalCost = 0;
      let totalValue = 0;

      for (const s in data) {
        const qty = data[s].qty;
        const cost = data[s].cost;

        if (qty <= 0) continue;

        const price = await getPrice(s);

        totalCost += cost;
        totalValue += price * qty;
      }

      const profit = totalValue - totalCost;
      const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

      const msg =
`📊 投資總覽

總成本：${totalCost.toFixed(0)}
現值：${totalValue.toFixed(0)}
損益：${profit.toFixed(0)}
報酬率：${roi.toFixed(2)}%`;

      await reply(replyToken, msg);
      return res.send("ok");
    }

    // =====================================================
    // 📊 個股查詢
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

      const msg =
`📊 個股明細

代碼：${stock}
名稱：${nameMap[stock] || "未知"}
股數：${qty}
成本：${avgCost.toFixed(2)}
市價：${price}
損益：${profit.toFixed(0)}`;

      await reply(replyToken, msg);
      return res.send("ok");
    }

    // =====================================================
    // 💰 交易（最後 fallback）
    // =====================================================
    const parts = text.split(" ");

    if (parts.length < 4) {
      await reply(replyToken, "格式: 買/賣 股票 價格 股數");
      return res.send("ok");
    }

    const [action, stock, priceStr, qtyStr] = parts;

    const price = Number(priceStr);
    const qty = Number(qtyStr);

    if (!action || !stock || isNaN(price) || isNaN(qty)) {
      await reply(replyToken, "資料錯誤");
      return res.send("ok");
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
