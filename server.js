const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// 動作確認用ルート
app.get('/', (req, res) => {
  res.send('✅ Smartsheet Webhook サーバーが動いてます！');
});

// Webhook用ルート
app.post('/webhook', (req, res) => {
  console.log('📩 Webhook received:', JSON.stringify(req.body, null, 2));

  // Hook チャレンジの確認応答
  if (req.headers['smartsheet-hook-challenge']) {
    res.set('Smartsheet-Hook-Response', req.headers['smartsheet-hook-challenge']);
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
