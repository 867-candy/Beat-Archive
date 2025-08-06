const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs'        `SELECT SUM(epg + lpg + egr + lgd + ebd + epr + ems) as modified_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = ?`,
const path = require('path');

// 8/3と8/4のデータを詳しく調査
async function debugAugust4Notes() {
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);

  try {
    console.log('=== 8/3と8/4 scoredatalog.db データ詳細分析 ===');

    // 8/3と8/4のデータ件数を確認
    const august3Count = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-03'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    const august4Count = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`2025-08-03のプレイ記録件数: ${august3Count.count}件`);
    console.log(`2025-08-04のプレイ記録件数: ${august4Count.count}件`);

    // 8/3のデータが多い場合、それを詳しく調査
    const targetDate = august3Count.count > august4Count.count ? '2025-08-03' : '2025-08-04';
    const targetCount = august3Count.count > august4Count.count ? august3Count.count : august4Count.count;
    
    console.log(`\n=== メイン分析対象: ${targetDate} (${targetCount}件) ===`);

    if (targetCount === 0) {
      // 日付範囲を確認
      const dateRange = await new Promise((resolve, reject) => {
        db.get(
          `SELECT 
             MIN(DATE(date + 32400, 'unixepoch')) as min_date,
             MAX(DATE(date + 32400, 'unixepoch')) as max_date,
             COUNT(*) as total_records
           FROM scoredatalog`,
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      
      console.log(`データベースの日付範囲: ${dateRange.min_date} ～ ${dateRange.max_date} (全${dateRange.total_records}件)`);
      
      // 8月のデータがあるかチェック
      const augustData = await new Promise((resolve, reject) => {
        db.all(
          `SELECT DATE(date + 32400, 'unixepoch') as play_date, COUNT(*) as count
           FROM scoredatalog 
           WHERE DATE(date + 32400, 'unixepoch') LIKE '2025-08-%'
           GROUP BY DATE(date + 32400, 'unixepoch')
           ORDER BY play_date`,
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      
      console.log('\n=== 2025年8月のプレイ記録 ===');
      augustData.forEach(day => {
        console.log(`${day.play_date}: ${day.count}件`);
      });
      
      return;
    }

    // 現在の計算式での総ノーツ数
    const currentTotal = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(epg + lpg + egr + lgd + ebd + epr + ems) as total_notes
         FROM scoredatalog 
         WHERE DATE(date, 'unixepoch') = ?`,
        [targetDate],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`修正後の計算式でのノーツ数 (epg+lpg+egr+lgd+ebd+epr+ems): ${currentTotal.total_notes}`);

    // 全ての判定カラムを含めた計算
    const allJudgeTotal = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as total_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = ?`,
        [targetDate],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`全判定カラム込みでのノーツ数: ${allJudgeTotal.total_notes}`);

    // notesカラムの合計
    const notesColumnTotal = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(notes) as total_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = ?`,
        [targetDate],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`notesカラムの合計: ${notesColumnTotal.total_notes}`);

    // 各判定カラムの詳細
    const judgeDetails = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
           SUM(epg) as total_epg,
           SUM(lpg) as total_lpg,
           SUM(egr) as total_egr,
           SUM(lgr) as total_lgr,
           SUM(egd) as total_egd,
           SUM(lgd) as total_lgd,
           SUM(ebd) as total_ebd,
           SUM(lbd) as total_lbd,
           SUM(epr) as total_epr,
           SUM(lpr) as total_lpr,
           SUM(ems) as total_ems,
           SUM(lms) as total_lms
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = ?`,
        [targetDate],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log('\n=== 各判定カラムの合計 ===');
    console.log(`EPG: ${judgeDetails.total_epg}`);
    console.log(`LPG: ${judgeDetails.total_lpg}`);
    console.log(`EGR: ${judgeDetails.total_egr}`);
    console.log(`LGR: ${judgeDetails.total_lgr}`);
    console.log(`EGD: ${judgeDetails.total_egd}`);
    console.log(`LGD: ${judgeDetails.total_lgd}`);
    console.log(`EBD: ${judgeDetails.total_ebd}`);
    console.log(`LBD: ${judgeDetails.total_lbd}`);
    console.log(`EPR: ${judgeDetails.total_epr}`);
    console.log(`LPR: ${judgeDetails.total_lpr}`);
    console.log(`EMS: ${judgeDetails.total_ems}`);
    console.log(`LMS: ${judgeDetails.total_lms}`);

    // 計算確認
    const manual_calc_old = judgeDetails.total_epg + judgeDetails.total_lpg + 
                           judgeDetails.total_egr + judgeDetails.total_lgr + 
                           judgeDetails.total_egd + judgeDetails.total_lgd + 
                           judgeDetails.total_ebd + judgeDetails.total_epr + 
                           judgeDetails.total_ems;

    const manual_calc_new = judgeDetails.total_epg + judgeDetails.total_lpg + 
                           judgeDetails.total_egr + judgeDetails.total_lgd + 
                           judgeDetails.total_ebd + judgeDetails.total_epr + 
                           judgeDetails.total_ems;

    const manual_calc_all = judgeDetails.total_epg + judgeDetails.total_lpg + 
                           judgeDetails.total_egr + judgeDetails.total_lgr + 
                           judgeDetails.total_egd + judgeDetails.total_lgd + 
                           judgeDetails.total_ebd + judgeDetails.total_lbd +
                           judgeDetails.total_epr + judgeDetails.total_lpr + 
                           judgeDetails.total_ems + judgeDetails.total_lms;

    console.log('\n=== 手動計算確認 ===');
    console.log(`旧式 (epg+lpg+egr+lgr+egd+lgd+ebd+epr+ems): ${manual_calc_old}`);
    console.log(`新式 (epg+lpg+egr+lgd+ebd+epr+ems): ${manual_calc_new}`);
    console.log(`全判定込み: ${manual_calc_all}`);

    // 8/4の個別プレイ記録をいくつか確認
    const sampleRecords = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, notes,
                (epg + lpg + egr + lgd + ebd + epr + ems) as new_calc,
                (epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as all_calc
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = ?
         LIMIT 5`,
        [targetDate],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    console.log('\n=== サンプルプレイ記録 (最初の5件) ===');
    sampleRecords.forEach((record, index) => {
      console.log(`\n${index + 1}. SHA256: ${record.sha256.substring(0, 12)}...`);
      console.log(`   EPG=${record.epg}, LPG=${record.lpg}, EGR=${record.egr}, LGR=${record.lgr}`);
      console.log(`   EGD=${record.egd}, LGD=${record.lgd}, EBD=${record.ebd}, LBD=${record.lbd}`);
      console.log(`   EPR=${record.epr}, LPR=${record.lpr}, EMS=${record.ems}, LMS=${record.lms}`);
      console.log(`   notes列: ${record.notes}`);
      console.log(`   新計算式 (epg+lpg+egr+lgd+ebd+epr+ems): ${record.new_calc}`);
      console.log(`   全判定計算: ${record.all_calc}`);
    });

  } catch (error) {
    console.error('分析エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
debugAugust4Notes().then(() => {
  console.log('\n=== 8/3と8/4データ分析完了 ===');
}).catch(error => {
  console.error('エラー:', error);
});
