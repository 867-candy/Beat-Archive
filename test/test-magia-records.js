const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const scoredatalogPath = path.join(sampleDbPath, 'scoredatalog.db');

// magia [Insane] SHA256
const magiaInsaneSHA256 = '7fa34407e48d30ea4461ccd3f41653696c216cbde25e8984aa01ca4fb33e7d5d';

async function testMagiaRecords() {
  console.log('=== magia [Insane] 記録検索テスト ===');
  console.log(`SHA256: ${magiaInsaneSHA256}`);
  console.log(`DB Path: ${scoredatalogPath}`);
  console.log('');

  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);

  try {
    // 8/1, 8/2, 8/3, 8/4の記録を検索（2025年）
    const dates = [
      { name: '8/1', date: '2025-08-01' },
      { name: '8/2', date: '2025-08-02' },
      { name: '8/3', date: '2025-08-03' },
      { name: '8/4', date: '2025-08-04' }
    ];

    for (const dateInfo of dates) {
      const start = dayjs(dateInfo.date).startOf('day').unix();
      const end = dayjs(dateInfo.date).endOf('day').unix();

      console.log(`--- ${dateInfo.name} (${dateInfo.date}) の記録 ---`);
      console.log(`検索範囲: ${start} - ${end}`);
      console.log(`日時範囲: ${dayjs.unix(start).format('YYYY-MM-DD HH:mm:ss')} - ${dayjs.unix(end).format('YYYY-MM-DD HH:mm:ss')}`);

      const records = await new Promise((resolve, reject) => {
        db.all(
          `SELECT epg, lpg, egr, lgr, minbp, clear, date,
                  (epg + lpg) * 2 + (egr + lgr) * 1 as calculated_score
           FROM scoredatalog 
           WHERE sha256 = ? AND date BETWEEN ? AND ? 
           ORDER BY date ASC`,
          [magiaInsaneSHA256, start, end],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      if (records.length > 0) {
        console.log(`✅ ${records.length}件の記録が見つかりました`);
        records.forEach((record, index) => {
          const playTime = dayjs.unix(record.date).format('YYYY-MM-DD HH:mm:ss');
          console.log(`  ${index + 1}. 日時: ${playTime}`);
          console.log(`     スコア: ${record.calculated_score}`);
          console.log(`     MISS: ${record.minbp}`);
          console.log(`     クリア: ${record.clear}`);
          console.log(`     判定: EPG=${record.epg}, LPG=${record.lpg}, EGR=${record.egr}, LGR=${record.lgr}`);
        });
      } else {
        console.log(`❌ 記録が見つかりませんでした`);
      }
      console.log('');
    }

    // 全期間での記録数を確認
    console.log('--- 全期間の記録数 ---');
    const totalRecords = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count, 
                MIN(date) as first_date, 
                MAX(date) as last_date,
                MAX((epg + lpg) * 2 + (egr + lgr) * 1) as best_score
         FROM scoredatalog 
         WHERE sha256 = ?`,
        [magiaInsaneSHA256],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (totalRecords.count > 0) {
      console.log(`✅ 全${totalRecords.count}件の記録があります`);
      console.log(`初回プレイ: ${dayjs.unix(totalRecords.first_date).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`最終プレイ: ${dayjs.unix(totalRecords.last_date).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`ベストスコア: ${totalRecords.best_score}`);
    } else {
      console.log(`❌ 記録が全く見つかりませんでした`);
    }

    console.log('');

    // 前日差分計算のテスト（8/4を対象日として）
    console.log('--- 前日差分計算テスト (8/4を対象) ---');
    const targetDate = dayjs('2025-08-04');
    const targetStart = targetDate.startOf('day').unix();

    // 8/4以前のベスト記録を取得
    const previousBest = await new Promise((resolve, reject) => {
      db.get(
        `SELECT epg, lpg, egr, lgr, minbp, clear, date,
                (epg + lpg) * 2 + (egr + lgr) * 1 as calculated_score
         FROM scoredatalog 
         WHERE sha256 = ? AND date < ?
         ORDER BY calculated_score DESC, minbp ASC, clear DESC, date DESC 
         LIMIT 1`,
        [magiaInsaneSHA256, targetStart],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (previousBest) {
      console.log(`✅ 8/4以前のベスト記録が見つかりました`);
      console.log(`日時: ${dayjs.unix(previousBest.date).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`スコア: ${previousBest.calculated_score}`);
      console.log(`MISS: ${previousBest.minbp}`);
      console.log(`クリア: ${previousBest.clear}`);
    } else {
      console.log(`❌ 8/4以前の記録が見つかりませんでした`);
    }

    // 8/4の記録を取得
    const targetEnd = targetDate.endOf('day').unix();
    const todayRecords = await new Promise((resolve, reject) => {
      db.all(
        `SELECT epg, lpg, egr, lgr, minbp, clear, date,
                (epg + lpg) * 2 + (egr + lgr) * 1 as calculated_score
         FROM scoredatalog 
         WHERE sha256 = ? AND date BETWEEN ? AND ? 
         ORDER BY date ASC`,
        [magiaInsaneSHA256, targetStart, targetEnd],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (todayRecords.length > 0) {
      console.log(`✅ 8/4の記録が${todayRecords.length}件見つかりました`);
      
      // 8/4のベスト記録を計算
      const todayBest = todayRecords.reduce((best, play) => {
        const playScore = (play.epg + play.lpg) * 2 + (play.egr + play.lgr) * 1;
        const bestScore = best ? (best.epg + best.lpg) * 2 + (best.egr + best.lgr) * 1 : -1;
        
        if (!best || 
            playScore > bestScore || 
            (play.minbp < best.minbp && play.minbp < 999999) || 
            play.clear > best.clear) {
          return play;
        }
        return best;
      }, null);

      if (todayBest) {
        console.log(`8/4ベスト記録:`);
        console.log(`日時: ${dayjs.unix(todayBest.date).format('YYYY-MM-DD HH:mm:ss')}`);
        console.log(`スコア: ${todayBest.calculated_score}`);
        console.log(`MISS: ${todayBest.minbp}`);
        console.log(`クリア: ${todayBest.clear}`);

        // 差分計算
        if (previousBest) {
          const scoreDiff = todayBest.calculated_score - previousBest.calculated_score;
          const missDiff = previousBest.minbp - todayBest.minbp;
          const clearDiff = todayBest.clear - previousBest.clear;

          console.log(`\n差分結果:`);
          console.log(`スコア差分: ${scoreDiff > 0 ? '+' : ''}${scoreDiff} (${previousBest.calculated_score} → ${todayBest.calculated_score})`);
          console.log(`MISS差分: ${missDiff > 0 ? '-' : '+'}${Math.abs(missDiff)} (${previousBest.minbp} → ${todayBest.minbp})`);
          console.log(`クリア差分: ${clearDiff > 0 ? '+' : ''}${clearDiff} (${previousBest.clear} → ${todayBest.clear})`);

          // 改善判定
          const improvements = [];
          if (scoreDiff > 0) improvements.push(`スコア改善: +${scoreDiff}`);
          if (missDiff > 0 && todayBest.minbp < 999999 && previousBest.minbp < 999999) improvements.push(`MISS改善: -${missDiff}`);
          if (clearDiff > 0) improvements.push(`クリア改善: ${previousBest.clear} → ${todayBest.clear}`);

          if (improvements.length > 0) {
            console.log(`\n✅ 改善項目: ${improvements.join(', ')}`);
          } else {
            console.log(`\n❌ 改善なし（初回プレイとして表示される可能性があります）`);
          }
        }
      }
    } else {
      console.log(`❌ 8/4の記録が見つかりませんでした`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

// テスト実行
testMagiaRecords().then(() => {
  console.log('\n=== テスト完了 ===');
}).catch(error => {
  console.error('テスト実行エラー:', error);
});
