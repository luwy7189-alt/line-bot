const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const SHEET_ID = "1-9-RSSysVjFKRQ7RnJ5zkGtKIxcKqjhmvA0fqCqj_sw";

async function getAuth() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  return auth;
}

app.get("/", (req, res) => {
  res.send("OK");
});

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.status(200).send("no event");
    }

    const text = event.message.text;
    const parts = text.split(" ");

    const action = parts[0];
    const stock = parts[1];
    const price = parts[2];
    const qty = parts[3];

    const auth = await getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
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

    return res.status(200).send("ok");

  } catch (err) {
    console.error(err);
    return res.status(200).send("error");
  }
});

module.exports = app;
