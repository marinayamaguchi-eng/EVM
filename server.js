const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { transposeDates } = require('./copy-date-columns.js'); // ← 日付列コピー処理を読み込む

const app = express();
app.use(bodyParser.json());

//設定
const ACCESS_TOKEN = "RQ34jaAZbCgNsnUkAagisx6GZXFwloXiLNEdn"; //アクセストークン
const PROJECT_BUTTON_COL_ID = 1633444489285508;  // ← プロジェクト作成ボタン列のID
const FIRST_ROW_ID = 8681498431000452;          // ← 日付マスタの1行目の行ID
const SHEET_ID = 2636365352095620;              // Webhook対象のシートID

//処理済イベントキャッシュ
const processedEvents = new Set();

//ボタンをOFFに戻す関数
async function resetProjectButton(){
  try{
    await axios.put(
      `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`,
      [
        {
          id:FIRST_ROW_ID,
          cells:[
            {
              columnId:PROJECT_BUTTON_COL_ID,
              value:false //OFFに戻す
            }
          ]
        }
      ],
      {
        headers:{
          Authorization:`Bearer ${ACCESS_TOKEN}`,
          'Content-Type':'application/json'
        }
      }
    );
    console.log("🔄 プロジェクト作成ボタンをOFFに戻しました！");
  }catch(err){
    console.error("❌ ボタンOFF失敗:", err.response?.data || err.message);
  }
}

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
        //ガード１．重複イベントをスキップ
        if(processedEvents.has(ev.id)){
          console.log("⚠️ 重複イベントをスキップ:", ev.id);
          continue;
        }
        processedEvents.add(ev.id);
        //1分後に削除してメモリを解放
         setTimeout(() => processedEvents.delete(ev.id), 60000);

         //ガード２．ONのときだけ実行
        if(
          ev.objectType === "cell" &&
          ev.eventType === "updated" &&
          ev.columnId === PROJECT_BUTTON_COL_ID &&
          ev.rowId === FIRST_ROW_ID&&
          ev.value === true // ← ONのときだけ
        ){
          console.log("✅ 1行目のプロジェクト作成ボタンがONになりました！");

          try{
            //1.日付コピー処理
            await transposeDates();
            console.loge("📌 日付コピー処理が完了しました");
          }catch(err){
            console.error("❌ 日付コピー処理中にエラー:", err.message);
          }finally{
            //2.成功・失敗にかかわらずボタンをOFFに戻す
            await resetProjectButton();
          }
        }
      }
    }
  } catch(err){
    console.error("❌ Webhook処理中エラー:", err.message);
    //万が一落ちてもOFFする
    await resetProjectButton();
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
