const express = require("express");
const { google } = require("googleapis");
const axios = require("axios");

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

// =========================
// 抓即時股價
// =========================
async function getPrice(stock) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stock}.TW`;
    const res = await axios.get(url);
    return res.data.quoteResponse.result[0].regularMarketPrice;
  } catch (e) {
    return 0;
  }
}

app.get("/", (req, res) => res.send("OK"));

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event) return res.send("no event");

    const text = event.message.text.trim();

    const auth = getAuth();
    await auth.authorize();

    const sheets = google.sheets({ version: "v4", auth });

    // =========================
    // 📌 查持股
    // =========================
    if (text === "持股") {

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

    // =========================
    // 📌 交易寫入（沿用你 STEP1）
    // =========================
    const [action, stock, priceStr, qtyStr] = text.split(" ");
    const price = Number(priceStr);
    const qty = Number(qtyStr);

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

    return res.send("ok");

  } catch (err) {
    console.error(err);
    res.send("error");
  }
});

module.exports = app;
