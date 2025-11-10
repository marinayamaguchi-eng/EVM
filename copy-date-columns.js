const axios = require('axios'); //API呼び出し用
const { add } = require('winston'); //ログの出力の方法を増やすための関数

//SmartsheetトークンとシートID
const ACCESS_TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN;
const SOURCE_SHEET_ID = Number(process.env.SOURCE_SHEET_ID);
const TARGET_SHEET_ID = Number(process.env.TARGET_SHEET_ID);
//APIリクエスト用ヘッダー
const headers = {
    'Authorization':`Bearer ${ACCESS_TOKEN}`,
    'Content-Type':'application/json'
};

//列を追加する関数(５０列に分割して追加)
const MAX_COLUMNS_PER_REQUEST = 50;

async function addColumns(sheetId, columns, count, headers,dates) { //この関数を呼ぶとシートにまとめて新し列を追加できる仕組み。(どのシートに追加するか 既にある列情報の配列　追加したい列の数 各省情報 列タイトルにつける日付)
   /* const added = []; //実際に追加できた列を記録する配列*/
    let remaining = count; //まだ追加すべき残りの配列数
    const MAX_COLUMNS_PER_REQUEST = 40; //1リクエスト40列まで(最大が50列だから）

    while(remaining>0){ //残りの列がまだあるなら繰り返し処理
                const chunkSize = Math.min(remaining,MAX_COLUMNS_PER_REQUEST); //chunkSize一度に追加する列の数
                const startIndex = columns.length; //右端に追加
                /*const baseIndex = added.length; //追加済みの列数を基準にして次のタイトルを決めるための値*/

                /*
                旧日付列
                //indexは必須なので全列同じstartIndexを指定
                const newColumns = Array(chunkSize).fill(0).map((_, i) => ({ //追加する列の数だけオブジェクトを作成
                    title:String(dates[added.length + i] ?? `列${startIndex + i + 1}`),//日付列
                    type:'TEXT_NUMBER', //列のデータは文字列
                    index:startIndex //右端に追加
                })); */

                //dates配列の値があれば列タイトルに日付を入れる。なければ連番で命名するロジック
                const newColumns = Array(chunkSize).fill(0).map((_, i) => { //chunkSize 回だけループして列オブジェクトを作成　Array(chunkSize)はchunkSizeの長さを持つからの配列をつくる。.fill(0)は空のままだと動かないから０を入れる　.map((_, i) => {...})で列ごとの処理を繰り返す
                    const rawDate = dates[addedCount + i]; //今作る列のタイトルに使う日付を取り出す
                    let title;
                    if(rawDate){ //日付があるなら日付にする
                        const d = new Date(rawDate); //JavaScript の Date 型に変換
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        title = `${y}/${m}/${day}`;
                    }else{
                        title = `列${startIndex + i + 1}`; //日付がなければ列１みたいに連番で命名
                    }

                    return{ //SmartsheetAPIに渡すための列の使用を返す
                        title, //列名
                        type:'TEXT_NUMBER', //Smartsheetの列の種類(文字・数字)
                        index:startIndex //右端に追加
                    };
                });

                const addColsResp = await axios.post( //新しい列をシートに追加
                    `https://api.smartsheet.com/2.0/sheets/${sheetId}/columns`, //${sheetId}は関数の引数名。実際にはTARGET_SHEET_IDが代入されている
                    newColumns,  //さっき作った列の配列
                    {headers} //認証情報(アクセストークンなど)をリクエストにつける
                );

                /*added.push(...addColsResp.data.result); //新列だけ保持*/
                columns.push(...addColsResp.data.result); //全リストも更新
                remaining -= chunkSize;
                addedCount += chunkSize; // ← 次のループでずらす
                await new Promise(r => setTimeout(r, 500)); // 少し休ませる
            }
            return{/*addedColumns: added,*/ allColumns: columns }; //ddedColumns:新しく追加した列だけ allColumns:既存の列 + 新規列
        }

//メイン処理
async function transposeDates() {    
    try {
        //1.元シートから日付取得(ボタンONの行だけ)
        const sourceSheetResp = await axios.get(
            `https://api.smartsheet.com/2.0/sheets/${SOURCE_SHEET_ID}`, //SmartsheetAPIを使ってSOURCE_SHEET_IDのシート全体を取得
            { headers }
        );

        const rows = sourceSheetResp.data.rows; //行のデータを取り出す


        //列IDを確認して「ボタン列」「日付列」のIDを取得
        const buttonCol = sourceSheetResp.data.columns.find(c => c.title === '日付追加'); 
        const dateCol   = sourceSheetResp.data.columns.find(c => c.title === '日付');
        if(!buttonCol){
            throw new Error("追加ボタン列が見つかりません。列名を確認してください。");
        }

        // フィルターをかけてボタンONの行だけ日付を抽出（例: 2列目が日付列とする）
        const dates = rows
        .filter(row =>{
            const buttonCell = row.cells.find(cell => cell.columnId === buttonCol.id);
            return buttonCell && buttonCell.value === true;  // ✅ チェックON
        })
        .map(row => { //mapは配列の要素を一つずづ変換して、新しい配列を作成する
            const dateCell = row.cells.find(cell => cell.columnId === dateCol.id);
            return dateCell ? dateCell.value : null;        // ✅ 日付列から値を取得　見つかればdateCell.valueを返し見つからなかったらnullを返す
        })
        .filter(Boolean); //nullやundefinedを解除して日付が入っているものだけを出す

        console.log("ボタンONの行から抽出した日付:", dates);


        //2.転置先シート取得
        const targetSheetResp = await axios.get( //axios.getdeでSmartsheet API の GET /sheets/{sheetId} エンドポイントを呼ぶ
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}`,
            {headers}
        );

        let columns = targetSheetResp.data.columns; //APIのレスポンスから列一覧columnsだけを取り出す

        //3.存在しない日付列を追加
        const existingTitles = columns.map(c => c.title); //列タイトルだけの配列を作成
        const formattedDates = dates.map(raw => { //元シートから拾ってきた日付を統一フォーマットに変換
            const d = new Date(raw);
            return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
        });

        const newDates = formattedDates.filter(title => !existingTitles.includes(title)); //新しく追加する日付列だけを取り出す

        if(newDates.length > 0){
            console.log(`⚠ 新しく ${newDates.length} 列を追加します...`);
            const{allColumns} = await addColumns( //SmartsheetAPIにリクエストを送り、新しい列を追加する。
               TARGET_SHEET_ID, columns, newDates.length, headers, newDates 
            );
            columns = allColumns; //新しい列を含んだ最新のカラム一覧を更新する
            console.log('✅ 列追加完了');
        }else{
            console.log("✅ 新しい日付列の追加は不要です"); //newDatesが全部すでに存在しているなら新しく追加しなくてよいからログだけ出す
        }


        /*
        //4.追加した列に日付を入れる
        const targetCols = addedColumns;　//新しく追加した列だけを配列で返しているのでそれを使う
        const newRow = {
            toTop:true,　//追加する行を一番上に入れる
            cells:dates.map((date,i) => ({ //行の中のセルを配列で並べる　取得した日付配列を回して追加した列IDに対応付けて値を入れる
                columnId : targetCols[i].id,
                value:String(date)
            })),
        };

        const addRowResp = await axios.post(
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/rows`,　//Smartsheet API の「行追加」エンドポイントを叩いて、実際にシートに反映
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
    const activeTitles = formattedDates; //ボタンONの行から拾った日付　残す列のタイトル

    const deleteTargets = existingDateCols.filter(c => !activeTitles.includes(c.title)); //既存の日付列の中でactiveTitlesに入っていない列だけ抽出　ボタンOFFの削除対象の列

    for(const col of deleteTargets){
        await axios.delete( //対象の列を一つずつDELETEリクエストで削除
         `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/columns/${col.id}`,
            { headers }
        );
         console.log(`🗑 削除: ${col.title}`);
    }

        await new Promise(resolve => setTimeout(resolve, 3000)); //削除直後のSmartsheet反映待ち

    //実際に削除が終わったらプログラム内で保持しているcolumns配列からも削除済みの列も消す（コード内ではまだ列があることになってるってズレが起きないようにするため）
    if(deleteTargets.length > 0){
        const deletedIds = new Set(deleteTargets.map(c => c.id)); //deleteTargetsの中にある列オブジェクトからidを取り出し削除した列のIDリストを作っておく
        columns = columns.filter(c => !deletedIds.has(c.id)); //columnsはシートに存在する全列を表す配列なのでフィルターでdeleteTargetsを外す
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
        const sortedCols = [...dateCols].sort((a, b) => { //[...] は配列のコピーを作成　aとbは配列の中から取り出された２つの要素。この二つの要素を比較して並び替える　sortは並び替えが完了したと判断された瞬間に終わる
            const [by,bm, bd] = b.title.split('/').map(Number);
            return new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd); //年/月/日を数値化してDateにし、差分で前後を決める
        });

        //ⅲ.シート前列を一度並べなおす
        const nonDateCols = columns.filter(c => !dateCols.includes(c)); //columnsのうち日付列以外を抽出
        const allColsSorted = [...nonDateCols, ...sortedCols]; //allColsSortedは最終的に並び替えたい列のリスト 日付列以外とソート後の日付列

        //ⅳ.並び替えをSmartsheetAPIに1列ずつ反映
        for(const [idx, col] of allColsSorted.entries()){ //idexは何番目に並べるか colはその列の情報
        await axios.put(
            `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}/columns/${col.id}`,
            {index: idx}, //１列ずつ位置を指定する処理
            {headers}
        );
    }

    console.log("✅ 列を古い日付 → 新しい日付に並び替えました");

    //並び替え直後にシートを再取得する
    const refreshed = await axios.get(
        `https://api.smartsheet.com/2.0/sheets/${TARGET_SHEET_ID}`,
        {headers}
    );

    await new Promise(resolve => setTimeout(resolve, 2000)); //日付列が安定するまで少し待つ

    //6.実績列にセル数式を入力(列数式はAPIで入れれない)
    //ⅰ.実績列を探す
    const actualCol = refreshed.data.columns.find(c => c.title === '実績');

    //ⅱ.並び替え後の日付列を再抽出
    const refreshedDateCols = refreshed.data.columns.filter(c =>
        /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c.title)
    );

    if (!actualCol || refreshedDateCols.length === 0) return; //実績列がない、日付列が一つもない状態なら処理を中断して終了

    //実績列に関数を設定
    const escapeTitle = (title) => title.replace(/\//g, '\/').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const firstTitle = escapeTitle(refreshedDateCols[0].title); //一番古い日付の列
    const lastTitle  = escapeTitle(refreshedDateCols[refreshedDateCols.length - 1].title); //一番新しい日付の列を作成

    const sumFormula =`=IF([行階層]@row = 0, 0, SUM([${firstTitle}]@row:[${lastTitle}]@row))`; //数式

    console.log("設定する数式:", sumFormula);

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
    const rows = refreshed.data.rows || []; //refreshed.data.rowsでシートの全行を取得　|| []で行が空白なら空配列にする
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH){ //forループで５００行ごとに処理
        const slice = rows.slice(i, i + BATCH); //rows.slice(i, i + BATCH) で 0〜499行目、500〜999行目… と切り出す
        const updateRows = slice.map(r => ({
            id: r.id,
            cells:[
                {
                    columnId: actualCol.id, //実績列のID
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

         //==== 計画・実績シートへ日付を縦に入れる処理を呼ぶ ====
         await syncDatesToInputSheet(formattedDates); //横に並んでいた日付列を転置し終えた後、それを計画・実績シートの楯列に入れる
    }

await sortDateColumns(columns, TARGET_SHEET_ID,headers);
 } catch (err) {
    console.error('❌ エラー:',err.response?.data || err.message);
 }
}

//計画・実績シートに日付を入力する
async function syncDatesToInputSheet(dates){ //関数宣言
    const SHEET_B_ID = Number(process.env.SHEET_B_ID);   // ←シートID
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

        const sheet = resp.data; //シートの中身を取り出す
        const rows = sheet.rows || []; //シートに行データがないときでもエラーにしないため
        const inputCol = resp.data.columns.find(c => c.title === INPUT_COL_TITLE); //度の列に書き込むかを特定指定kる。c.title は列のタイトル
         if(!inputCol) throw new Error("${INPUT_COL_TITLE}' 列が見つかりません"); //列が存在しない場合処理を中断しcatchへ

         const primaryCol = sheet.columns.find(c => c.primary); //Smartsheetのプライマリ列を取得している 行追加時にはこの列が空だと追加できないことがあるため、後で「新しい行を追加するときに使う」ために取得しておくことが多い。

         //日付を昇順&形を変える
         const sortedDates = [...dates] //dates解列をコピーして新しい配列を作成(直接datesを触ると元データを壊す恐れがある)
         .filter(Boolean)
         .sort((a,b) => new Date(a) - new Date(b)) //日付を昇順に並べる
         .map(toISODate); //各日付をYYYY/MM/DD → YYYY-MM-DDに直す関数

         //既存行に日付をセット
         const updateRows = rows.map((r, i) => ({ //rows:シートの既存行 .map():配列の要素一つ一つを変換して新しい配列を作る
            id: r.id,
            cells:[{ columnId: inputCol.id, value: sortedDates[i] || null }] //実際に更新するセルの内容を入れる　sortedDatesの方が短い場合(行数＞日付数)にはnullを入れてセルを空にする
         }));


         //500件ずつ更新
         for(let i = 0; i < updateRows.length; i += BATCH){ //i += BATCHは500件ずつスキップして次へ
            const slice = updateRows.slice(i, i + BATCH); //実際に500件分を切り出して変数sliceに入れる
            await axios.put(
                `https://api.smartsheet.com/2.0/sheets/${SHEET_B_ID}/rows`,
                slice, //今回送る５００件のデータ
                { headers }
            );
         }

         //行が足りなければ追加
         if(sortedDates.length > resp.data.rows.length){ //追加したい日付の方が多い場合
            const extraDates = sortedDates.slice(rows.length);
            const newRows = extraDates.map(d => ({ //新しい行データを作成
                toBottom:true,
                cells:[{columnId: inputCol.id, value: d}]
            }));
            await axios.post( //PUTは更新POSTは追加
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
module.exports = {transposeDates,syncDatesToInputSheet}; //server.js内でも関数を呼べるようにする

//このファイルを直接実行したときだけ動かす
if(require.main === module){ //直接実行されるとこのファイルがメインのmoduleになる
    transposeDates();
}


