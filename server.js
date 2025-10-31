const express = require('express'); //Node.jsでWebサーバーを立ち上げる 『サーバー』
const bodyParser = require('body-parser'); //SmartsheetのWebhookが送ってくるデータはJSONだからこれを使ってreq.bodyで扱えるようにする　『リクエスト分解』
const axios = require('axios'); //SmartsheetAPIにアクセスするときに使用　『外部APIアクセス』
const { transposeDates } = require('./copy-date-columns.js'); // ← 別ファイルで作成した日付列コピー処理を読み込む　『処理モジュール読み込み』

const app = express(); //Expressのアプリケーション本体を生成 appがWebサーバーそのもの
app.use(bodyParser.json()); //すべてのリクエストに対してもしpakege.jsonが来たら自動でパース(データを解釈してプログラムが扱える形に変換)する設定。/webhookに届いたJSONがreq.bpdyですぐに使えすようにする

//設定　Renderの環境変数で設定　URLなどに使用するために呼ぶ
const ACCESS_TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN; //アクセストークン　Renderに登録した環境変数を読み込むためにprocess.env
const PROJECT_BUTTON_COL_ID = Number(process.env.PROJECT_BUTTON_COL_ID);  // ← プロジェクト作成ボタン列のID　文字列で読み込まれないようにNumberを付ける
const FIRST_ROW_ID = Number(process.env.FIRST_ROW_ID);          // ← 日付マスタの1行目の行ID
const SHEET_ID = Number(process.env.SOURCE_SHEET_ID);              // Webhook対象のシートID

//既に処理したイベントをスキップ　Setは値を一気に管理する仕組み。webhookは同じイベントを複数回送ってくることがあるから既に処理したイベントかどうかを判別するためのキャッシュ置き場
const processedEvents = new Set();

//ボタンの値を取得する関数
async function getButtonValue() {
  try{
    const resp = await axios.get( //SmartsheetAPIにアクセス
      `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows/${FIRST_ROW_ID}`, //シートの特定の行のデータを取得
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }  //認証にアクセストークンが必要になる
      }
    );
    const row = resp.data; //レスポンスから行データを取得
    const cell = row.cells.find(c => c.columnId === PROJECT_BUTTON_COL_ID); //ボタン列のセルを探す
    return cell?.value || false; //セルの値を返す cell?.value：セルが存在すればtrue・falseが入る　||false:nullなどの場合ならfalse
  }catch (err) {
    console.error("❌ ボタン値取得失敗:", err.response?.data || err.message);
    return false;
  }
}


//ボタンをOFFに戻す関数
async function resetProjectButton(){
  try{
    await axios.put( //SmartsheetAPIにPUTリクエスト
      `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`,
      [ //更新内容
        {
          id:FIRST_ROW_ID, //更新対象の行ID
          cells:[
            {
              columnId:PROJECT_BUTTON_COL_ID, //ボタン列
              value:false //OFFに戻す
            }
          ]
        }
      ],
      {
        headers:{ //APIにアクセスするための情報
          Authorization:`Bearer ${ACCESS_TOKEN}`, //確認用のトークン
          'Content-Type':'application/json' //JSON形式で送る
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

// Webhook用ルート　SmartsheetからWebhookが届いたときにその中身を全部コンソールに表示するテスト処理
app.post('/webhook', async (req, res) => { //app.post('/webhook' POSTリクエストを受け取る　Webhookが反応すると変更内容などをJsonでここに受信する
  console.log('📩 Webhook received:', JSON.stringify(req.body, null, 2)); //JSON.stringify(req.body, null, 2)：JSONを整形してログに出す　req.bodyはWebhookが送ってきたリクエストの中身　null,2はインデント幅2で見やすくするため　

  // Hook チャレンジの確認応答 Smartsheetで新しくWebhookを登録するとき本当にそのサーバーが生きていて応答できるかをチェックする。その時に、SmartsheetはリクエストのHTTPヘッダーにsmartsheet-hook-challengeというランダムな文字列を入れて送ってくる。
  //サーバー側はその文字列をそのままSmartsheet-Hook-Responseというヘッダーに入れて返す必要がある。これを行うことでSmartsheetはこのサーバーはちゃんと応答できると判断してWebhookを有効化してくれる
  //これをやらないとWebhookが無効化される
  if (req.headers['smartsheet-hook-challenge']) {
    res.set('Smartsheet-Hook-Response', req.headers['smartsheet-hook-challenge']);
    return res.sendStatus(200);
  }
//実際のWebhookイベント処理に入る
  try{
    const{ scopeObjectId, events } = req.body; //req.body:どのシートイベントの情報 scopeObjectId:Webhookが紐づいている対象 events:イベントの配列

    //Webhook対象シートか確認
    if(scopeObjectId === SHEET_ID && events){
      for(const ev of events){ //evとはWebhookから送られてくるイベント情報の１件分を表している　つまりサーバーに送られてくるJsonのリストeventsの配列をforループで１つずつ取り出し取り出した１件分がev.イベント一件の情報
        //ガード１．重複イベントをスキップ webhookは同じ更新を複数回通知することがありそのままだと処理が何回も走ってしまうのでrowId+columnId+timestampを組み合わせて一意のキーを作成し処理済みならスキップをする
        const uniqueKey = `${ev.rowId}-${ev.columnId}-${ev.timestamp}`;
        if(processedEvents.has(uniqueKey)){
          console.log("⚠️ 重複イベントをスキップ:", ev.id);
          continue;
        }
        processedEvents.add(uniqueKey);
        //1分後に削除してメモリを解放　メモリが無限に増えないようにする
         setTimeout(() => processedEvents.delete(ev.id), 60000);

         //ガード２．ONのときだけ実行
         console.log("📝 受信イベント:", JSON.stringify(ev, null, 2));

        if(
          ev.objectType === "cell" && //受信したイベントが
          ev.eventType === "updated" &&
          ev.columnId === PROJECT_BUTTON_COL_ID &&
          ev.rowId === FIRST_ROW_ID
         ){
          console.log("✅ 1行目のプロジェクト作成ボタンがONになりました！");

          //APIで実際の値を確認
          const buttonValue = await getButtonValue(); //Webhookのイベントを受け取っただけでは本当にボタンがONか信用できないことがあるためgetButtonValue()関数を呼んでSmartsheetAPIにアクセスしてシート上の最新のボタンの値を確認
          if(buttonValue === true){
            console.log("✅ ボタンがONなので処理を開始します");

          try{
            //1.日付コピー処理
            await transposeDates(); //transposeDates() は別ファイル (copy-date-columns.js) にある関数で、日付列をコピーする処理　awaitが付いているので処理が終わるまで待つ
            console.log("📌 日付コピー処理が完了しました");
          }catch(err){
            console.error("❌ 日付コピー処理中にエラー:", err.message);
          }finally{ //finallyは成功しても失敗しても必ず実行される
            //2.成功・失敗にかかわらずボタンをOFFに戻す
            await resetProjectButton();
          }
        }else{
          console.log("🔎 ボタンはOFFなので処理をスキップしました");
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

const PORT = process.env.PORT || 3000; //ローカルで動かすときデフォルトで３０００番ポートを使う
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`)); //クラウドで動かすときPORT変数を渡す
