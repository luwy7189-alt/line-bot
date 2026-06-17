const express = require("express");

const app = express();

app.use(express.json());

// 首頁測試
app.get("/", (req, res) => {
  res.send("OK");
});

// LINE Webhook測試
app.post("/webhook", (req, res) => {

  console.log("🔥 WEBHOOK HIT");

  console.log(
    JSON.stringify(req.body, null, 2)
  );

  return res.status(200).send("ok");

});

module.exports = app;
