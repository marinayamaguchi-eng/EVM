const axios = require("axios");

const TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN;  // 個人アクセストークン
const SHEET_ID = Number(process.env.SOURCE_SHEET_ID); // 日付マスタのシートID

async function createWebhook() {
  try {
    const resp = await axios.post(
      "https://api.smartsheet.com/2.0/webhooks",
      {
        name: "DateMasterWebhook", // 好きな名前
        callbackUrl: process.env.RENDER_CALLBACK_URL, // RenderのURL
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







