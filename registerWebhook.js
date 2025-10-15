const axios = require('axios');

const token = process.env.SMARTSHEET_ACCESS_TOKEN; // Render環境変数に入れたやつ
const sheetId = 'ここに対象のシートID'; 

async function createWebhook() {
  try {
    const res = await axios.post(
      'https://api.smartsheet.com/2.0/webhooks',
      {
        name: 'My Test Webhook',
        callbackUrl: 'https://evm-zt05.onrender.com/webhook',
        scope: 'sheet',
        scopeObjectId: sheetId,
        events: ['*.*'],
        version: 1
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Webhook作成成功:', res.data);
  } catch (err) {
    console.error('❌ Webhook作成失敗:', err.response?.data || err.message);
  }
}

createWebhook();
