const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("OK");
});

app.post("/webhook", (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event) return res.send("no event");

    const text = event.message.text;
    console.log(text);

    res.send("ok");
  } catch (e) {
    console.log(e);
    res.send("error");
  }
});

module.exports = app;
