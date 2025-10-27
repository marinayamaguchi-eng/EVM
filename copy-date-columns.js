const axios = require('axios');
const { add } = require('winston');

//SmartsheetトークンとシートID
const ACCESS_TOKEN = 'RQ34jaAZbCgNsnUkAagisx6GZXFwloXiLNEdn';
const SOURCE_SHEET_ID = '3984291311603588';
const TARGET_SHEET_ID = '138577057894276';

const headers = {
    'Authorization':`Bearer ${ACCESS_TOKEN}`,
    'Content-Type':'application/json'
};

const MAX_COLUMNS_PER_REQUEST = 50;

//列を追加する関数(５０列に分割して追加)
async function addColumns(sheetId, columns, count, headers,dates) {
    const added = [];
    let remaining = count;
    const MAX_COLUMNS_PER_REQUEST = 50;

    while(remaining>0){
                const chunkSize = Math.min(remaining,MAX_COLUMNS_PER_REQUEST);
                const startIndex = columns.length; //右端に追加
                const baseIndex = added.length; //追加済みの列数を基準に

                /*
                旧日付列
                //indexは必須なので全列同じstartIndexを指定
                const newColumns = Array(chunkSize).fill(0).map((_, i) => ({
                    title:String(dates[added.length + i] ?? `列${startIndex + i + 1}`),//日付列
                    type:'TEXT_NUMBER',
                    index:startIndex 
                })); */

                const newColumns = Array(chunkSize).fill(0).map((_, i) => {
                    const rawDate = dates[baseIndex + i];
                    let title;
                    if(rawDate){
                        const d = new Date(rawDate);
                        title = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                    }else{
                        title = `列${startIndex + i + 1}`;
                    }

                    return{
                        title,
                        type:'TEXT_NUMBER',
                        index:startIndex
                    };
                });

                const addColsResp = await axios.post(
                    `https://api.smartsheet.com/2.0/sheets/${sheetId}/columns`,
                    newColumns,  
                    {headers}
                );

                added.push(...addColsResp.data.result); //新列だけ保持
                columns.push(...addColsResp.data.result); //全リストも更新
                remaining -= chunkSize;
            }
            return{addedColumns: added, allColumns: columns };
        }

//メイン処理
async function transposeDates() {    
    try {
        //1.元シートから日付取得(ボタンONの行だけ)
        const sourceSheetResp = await axios.get(
            `https://api.smartsheet.com/2.0/sheets/${SOURCE_SHEET_ID}`,
            { headers }
        );

        const rows = sourceSheetResp.data.rows;


        //列IDを確認して「ボタン列」「日付列」のIDを取得
        const buttonCol = sourceSheetResp.data.columns.find(c => c.title === '日付追加'); 
        const dateCol   = sourceSheetResp.data.columns.find(c => c.title === '日付');
        if(!buttonCol){
            throw new Error("追加ボタン列が見つかりません。列名を確認してください。");
        }

        // ボタンONの行だけ日付を抽出（例: 2列目が日付列とする）
        const dates = rows
        .filter(row =>{
            const buttonCell = row.cells.find(cell => cell.columnId === buttonCol.id);
            return buttonCell && buttonCell.value === true;  // ✅ チェックON
        })
        .map(row => {
            const dateCell = row.cells.find(cell => cell.columnId === dateCol.id);
            return dateCell ? dateCell.value : null;        // ✅ 日付列から値を取得
        })
        .filter(Boolean);

        console.log("ボタンONの行から抽出した日付:", dates);


        /*
        //1.元シートから日付取得
        const sourceSheetResp = await axios.get(
            `https://api.smartsheet.com/2.0/sheets/${SOURCE_SHEET_ID}`,
            {headers}
        );

        const dates = sourceSheetResp.data.rows
        .map(row => row.cells[1]?.value) //cellsの２列目
        .filter(Boolean);

        console.log("抽出した日付:", dates);
        */

        //2.転置先シート取得
        const targetSheetResp = await axios.get(
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}`,
            {headers}
        );

        let columns = targetSheetResp.data.columns;

        //3.存在しない日付列を追加
        const existingTitles = columns.map(c => c.title);
        const formattedDates = dates.map(raw => {
            const d = new Date(raw);
            return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
        });

        const newDates = formattedDates.filter(title => !existingTitles.includes(title));

        if(newDates.length > 0){
            console.log(`⚠ 新しく ${newDates.length} 列を追加します...`);
            const{allColumns} = await addColumns(
               TARGET_SHEET_ID, columns, newDates.length, headers, newDates 
            );
            columns = allColumns;
            console.log('✅ 列追加完了');
        }else{
            console.log("✅ 新しい日付列の追加は不要です");
        }


        /*
        //4.追加した列に日付を入れる
        const targetCols = addedColumns;
        const newRow = {
            toTop:true,
            cells:dates.map((date,i) => ({
                columnId : targetCols[i].id,
                value:String(date)
            })),
        };

        const addRowResp = await axios.post(
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/rows`,
            [newRow],
            {headers}
        );


        console.log('✅ 転置完了！',addRowResp.data);

        */



    /*
    //既存の列タイトルを日付形式(M/D)に変換
    const existingDateCols = columns.filter(c => /^\d{1,2}\/\d{1,2}$/.test(c.title));

    //ボタンON日付
    const activeTitles = dates.map(raw => {
        const d = new Date(raw);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    */


    //4.ボタンがOFFの列の削除
    const existingDateCols = columns.filter(c => /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c.title));
    const activeTitles = formattedDates;

    const deleteTargets = existingDateCols.filter(c => !activeTitles.includes(c.title));

    for(const col of deleteTargets){
        await axios.delete(
         `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/columns/${col.id}`,
            { headers }
        );
         console.log(`🗑 削除: ${col.title}`);
    }

    if(deleteTargets.length > 0){
        const deletedIds = new Set(deleteTargets.map(c => c.id));
        columns = columns.filter(c => !deletedIds.has(c.id));
    }

    //５．日付列を並び替える
    async function sortDateColumns(columns, TARGET_SHEET_ID, headers) {
        //ⅰ.日付形式(Y/M/D)の列だけ抽出
        const dateCols = columns.filter(c => /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c.title));

        if(dateCols.length === 0) {
            console.log("⚠️ 日付列が見つかりません。");
            return;
        }

        //ⅱ.日付で昇順ソート
        const sortedCols = [...dateCols].sort((a, b) => {
            const [ay,am, ad] = a.title.split('/').map(Number);
            const [by,bm, bd] = b.title.split('/').map(Number);
            return new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd);
        });

        //ⅲ.シート前列を一度並べなおす
        const nonDateCols = columns.filter(c => !dateCols.includes(c));
        const allColsSorted = [...nonDateCols, ...sortedCols];

        //ⅳ.並び替えをSmartsheetAPIに1列ずつ反映
        for(const [idx, col] of allColsSorted.entries()){
        await axios.put(
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/columns/${col.id}`,
            {index: idx},
            {headers}
        );
    }

    console.log("✅ 列を古い日付 → 新しい日付に並び替えました");

    //並び替え直後にシートを再取得する
    const refreshed = await axios.get(
        `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}`,
        {headers}
    );

    //6.実績列にセル数式を入力(列数式はAPIで入れれない)
    //ⅰ.実績列を探す
    const actualCol = refreshed.data.columns.find(c => c.title === '実績');

    //ⅱ.並び替え後の日付列を再抽出
    const refreshedDateCols = refreshed.data.columns.filter(c =>
        /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c.title)
    );

    if (!actualCol || refreshedDateCols.length === 0) return;

    //実績列に関数を設定
    const sumFormula =
     `=IF([行階層]@row = 0, "", SUM([${refreshedDateCols[0].title}]@row:[${refreshedDateCols[refreshedDateCols.length - 1].title}]@row))`;

     /* APIで列数式は使えないためボツ
   //列数式として更新
   await axios.put(
    `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/columns/${actualCol.id}`,
    {
        columnFormula: sumFormula //列数式
    },
    {headers}
);
    console.log(`✅ 実績列に列数式を設定しました: ${sumFormula}`);
}
   */

    //500行ずつに分割して追加
    //全行に対して更新リクエストを作成
    const rows = refreshed.data.rows || [];
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH){
        const slice = rows.slice(i, i + BATCH);
        const updateRows = slice.map(r => ({
            id: r.id,
            cells:[
                {
                    columnId: actualCol.id,
                    formula: sumFormula //セル数式として設定
                }
            ]
        }))

        //APIで更新
        if (updateRows.length > 0){
            await axios.put(
                `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/rows`,
                updateRows,
                {headers}
            );
        }
    }
         console.log(`✅ 実績列に式を全行に入れました: ${sumFormula}`);

         //計画・実績シートへ日付を縦に入れる処理を呼ぶ
         await syncDatesToInputSheet(formattedDates);
    }
/*
    //APIで更新
    if (updateRows.length > 0){
    await axios.put(
        `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/rows`,
        updateRows,
        {headers}
    );
    console.log(`✅ 実績列に式を全行に入れました: ${sumFormula}`);
       }
      }
     }
      */

await sortDateColumns(columns, TARGET_SHEET_ID,headers);
 } catch (err) {
    console.error('❌ エラー:',err.response?.data || err.message);
 }
}

//計画・実績シートに日付を入力する
async function syncDatesToInputSheet(dates){
    const SHEET_B_ID = "5107536727330692";   // ←シートID
    const INPUT_COL_TITLE = "日付｜入力"; // ←列名
    const BATCH = 500;

    //SmartsheetのDATE型にする
    const toISODate = (d) =>{
        const dt = new Date(d);
        const y = dt.getFullYear();
        const m = String(dt.getMonth()+1).padStart(2,"0");
        const day = String(dt.getDate()).padStart(2,"0");
        return`${y}-${m}-${day}`;
    }

    try{
        //シートの情報取得
        const resp = await axios.get(
            `https://api.smartsheet.com/2.0/sheets/${SHEET_B_ID}`,
            { headers }
        );

        const sheet = resp.data;
        const rows = sheet.rows || [];
        const inputCol = resp.data.columns.find(c => c.title === INPUT_COL_TITLE);
         if(!inputCol) throw new Error("${INPUT_COL_TITLE}' 列が見つかりません");

         const primaryCol = sheet.columns.find(c => c.primary);

         //日付を昇順&形を変える
         const sortedDates = [...dates]
         .filter(Boolean)
         .sort((a,b) => new Date(a) - new Date(b))
         .map(toISODate);

         //既存行に日付をセット
         const updateRows = rows.map((r, i) => ({
            id: r.id,
            cells:[{ columnId: inputCol.id, value: sortedDates[i] || null }]
         }));


         //500件ずつPUT
         for(let i = 0; i < updateRows.length; i += BATCH){
            const slice = updateRows.slice(i, i + BATCH);
            await axios.put(
                `https://api.smartsheet.com/2.0/sheets/${SHEET_B_ID}/rows`,
                slice,
                { headers }
            );
         }

         //行が足りなければ追加
         if(sortedDates.length > resp.data.rows.length){
            const extraDates = sortedDates.slice(rows.length);
            const newRows = extraDates.map(d => ({
                toBottom:true,
                cells:[{columnId: inputCol.id, value: d}]
            }));
            await axios.post(
                `https://api.smartsheet.com/2.0/sheets/${SHEET_B_ID}/rows`,
                newRows,
                {headers}
            );
            console.log(`➕ ${newRows.length} 行を追加しました`);
         }

         console.log(`✅ シートBの「日付｜入力」を更新しました: ${sortedDates.length} 件`);

    }catch(err){
        console.error("❌ syncDatesToInputSheet エラー:", err.response?.data || err.message);
    }
}

//関数を外部でも使えるようにエクスポート
module.exports = {transposeDates,syncDatesToInputSheet};

//このファイルを直接実行したときだけ動かす
if(require.main === module){
    transposeDates();
}


