const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const app = express();
app.use(express.json());

// 👉 你的 Google Sheet ID
const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

// 👉 這裡之後會放 Google Service Account（下一步我再帶你做）
async function getSheet() {
const doc = new GoogleSpreadsheet(SHEET_ID);

await doc.useServiceAccountAuth({
client_email: process.env.GOOGLE_CLIENT_EMAIL,
private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, "\n"),
});

await doc.loadInfo();
return doc.sheetsByTitle["交易紀錄"];
}

app.get("/", (req, res) => {
res.send("OK");
});

app.post("/webhook", async (req, res) => {
try {
const event = req.body.events?.[0];

```
if (!event || event.type !== "message") {
  return res.status(200).send("no event");
}

const text = event.message.text;
const parts = text.split(" ");

// 預期格式：買 2327 966 17
const action = parts[0];
const stock = parts[1];
const price = parts[2];
const qty = parts[3];

const sheet = await getSheet();

await sheet.addRow({
  time: new Date().toISOString(),
  stock,
  action,
  price,
  qty,
});

return res.status(200).send("ok");
```

} catch (err) {
console.log(err);
return res.status(200).send("error");
}
});

module.exports = app;
