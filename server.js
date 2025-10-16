const express = require('express');
const bodyParser = require('body-parser');
const { transposeDates } = require('./copy-date-columns'); // ← 日付列コピー処理を読み込む

const app = express();
app.use(bodyParser.json());

//設定
const PROJECT_BUTTON_COL_ID = 1633444489285508;  // ← プロジェクト作成ボタン列のID
const FIRST_ROW_ID = 8681498431000452;          // ← 日付マスタの1行目の行ID
const SHEET_ID = 2636365352095620;              // Webhook対象のシートID

// 動作確認用ルート
app.get('/', (req, res) => {
  res.send('✅ Smartsheet Webhook サーバーが動いてます！');
});

// Webhook用ルート
app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook received:', JSON.stringify(req.body, null, 2));

  // Hook チャレンジの確認応答
  if (req.headers['smartsheet-hook-challenge']) {
    res.set('Smartsheet-Hook-Response', req.headers['smartsheet-hook-challenge']);
    return res.sendStatus(200);
  }

  try{
    const{ scopeObjectId, events } = req.body;

    //Webhook対象シートか確認
    if(scopeObjectId === SHEET_ID && events){
      for(const ev of events){
        if(
          ev.objectType === "cell" &&
          ev.eventType === "updated" &&
          ev.columnId === PROJECT_BUTTON_COL_ID &&
          ev.rowId === FIRST_ROW_ID
        ){
          console.log("✅ 1行目のプロジェクト作成ボタンがONになりました！");
          await transposeDates(); // ← ここで日付コピー処理を実行
        }
      }
    }
  } catch(err){
    console.error("❌ Webhook処理中エラー:", err.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
