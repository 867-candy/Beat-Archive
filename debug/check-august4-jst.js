const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// 日本時間で2025/8/4の総ノーツ数を確認
async function checkAugust4JST() {
  const scoredatalogPath = path.join(__dirname, '..', 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);

  try {
    console.log('=== scoredatalog.db 日本時間2025/8/4データ確認 ===');
    console.log(`DBパス: ${scoredatalogPath}`);
    console.log('');

    // 日本時間2025/8/4 00:00:00 から 23:59:59の範囲
    // UNIXタイムスタンプ + 32400秒（9時間）で日本時間に変換
    
    // 2025/8/4の件数確認
    const count = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`日本時間2025-08-04のプレイ記録件数: ${count.count}件`);

    if (count.count === 0) {
      console.log('❌ 2025-08-04のデータがありません');
      
      // データの日付範囲を確認
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
      
      console.log(`\n📊 データベース全体の日付範囲（日本時間）:`);
      console.log(`  最古: ${dateRange.min_date}`);
      console.log(`  最新: ${dateRange.max_date}`);
      console.log(`  総レコード数: ${dateRange.total_records}件`);
      
      // 8月のデータを確認
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
      
      console.log(`\n📅 2025年8月のデータ:`);
      augustData.forEach(row => {
        console.log(`  ${row.play_date}: ${row.count}件`);
      });
      
      return;
    }

    // 総ノーツ数を計算（修正式: epg+lpg+egr+lgd+ebd+epr+ems）
    const totalNotes = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(epg + lpg + egr + lgd + ebd + epr + ems) as total_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`\n✅ 日本時間2025-08-04の総ノーツ数: ${totalNotes.total_notes}`);
    console.log(`   計算式: epg + lpg + egr + lgd + ebd + epr + ems`);

    // 参考：全判定込みの総ノーツ数
    const allJudgeNotes = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as total_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`   参考（全判定込み）: ${allJudgeNotes.total_notes}`);

    // notesカラムの値
    const notesColumn = await new Promise((resolve, reject) => {
      db.get(
        `SELECT SUM(notes) as total_notes
         FROM scoredatalog 
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`   参考（notesカラム）: ${notesColumn.total_notes}`);

    // 各判定の詳細
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
         WHERE DATE(date + 32400, 'unixepoch') = '2025-08-04'`,
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    console.log(`\n📊 各判定の内訳:`);
    console.log(`  EPG: ${judgeDetails.total_epg}`);
    console.log(`  LPG: ${judgeDetails.total_lpg}`);
    console.log(`  EGR: ${judgeDetails.total_egr}`);
    console.log(`  LGR: ${judgeDetails.total_lgr}`);
    console.log(`  EGD: ${judgeDetails.total_egd}`);
    console.log(`  LGD: ${judgeDetails.total_lgd}`);
    console.log(`  EBD: ${judgeDetails.total_ebd}`);
    console.log(`  LBD: ${judgeDetails.total_lbd}`);
    console.log(`  EPR: ${judgeDetails.total_epr}`);
    console.log(`  LPR: ${judgeDetails.total_lpr}`);
    console.log(`  EMS: ${judgeDetails.total_ems}`);
    console.log(`  LMS: ${judgeDetails.total_lms}`);

    // 手動計算確認
    const manualCalc = judgeDetails.total_epg + judgeDetails.total_lpg + judgeDetails.total_egr + 
                     judgeDetails.total_lgd + judgeDetails.total_ebd + judgeDetails.total_epr + 
                     judgeDetails.total_ems;
    
    console.log(`\n🔍 手動計算確認: ${manualCalc}`);
    console.log(`   (${judgeDetails.total_epg} + ${judgeDetails.total_lpg} + ${judgeDetails.total_egr} + ${judgeDetails.total_lgd} + ${judgeDetails.total_ebd} + ${judgeDetails.total_epr} + ${judgeDetails.total_ems})`);

  } catch (error) {
    console.error('❌ エラー:', error.message);
  } finally {
    db.close();
  }
}

// 実行
checkAugust4JST().then(() => {
  console.log('\n=== 確認完了 ===');
}).catch(error => {
  console.error('分析エラー:', error);
});
