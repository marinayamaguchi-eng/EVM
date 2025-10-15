const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  console.log('📩 Webhook received:', JSON.stringify(req.body, null, 2));

  if (req.headers['smartsheet-hook-challenge']) {
    res.set('Smartsheet-Hook-Response', req.headers['smartsheet-hook-challenge']);
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
