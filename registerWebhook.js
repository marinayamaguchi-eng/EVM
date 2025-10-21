const axios = require("axios");

const TOKEN = "RQ34jaAZbCgNsnUkAagisx6GZXFwloXiLNEdn";  // 個人アクセストークン
const SHEET_ID = "3984291311603588";              // 日付マスタのシートID

async function createWebhook() {
  try {
    const resp = await axios.post(
      "https://api.smartsheet.com/2.0/webhooks",
      {
        name: "DateMasterWebhook",                        // 好きな名前
        callbackUrl: "https://evm-zdt5.onrender.com/webhook", // RenderのURL
        scope: "sheet",
        scopeObjectId: SHEET_ID,
        events: ["*.*"], // 全イベント受け取る（更新のみなら ["*"] のままでOK）
        version: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Webhook作成成功:", resp.data);
  } catch (err) {
    console.error("❌ Webhook作成エラー:", err.response?.data || err.message);
  }
}

createWebhook();


