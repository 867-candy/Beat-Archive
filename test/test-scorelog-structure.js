const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const scorelogPath = path.join(sampleDbPath, 'scorelog.db');

async function testScorelogStructure() {
  console.log('=== scorelog.db 構造とサンプルデータ確認 ===');
  console.log(`DB Path: ${scorelogPath}`);
  console.log('');

  const db = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);

  try {
    // scorelog.dbの基本情報
    const totalRecords = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count, 
                COUNT(DISTINCT sha256) as unique_songs,
                MIN(date) as first_date, 
                MAX(date) as last_date
         FROM scorelog`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    console.log(`総記録数: ${totalRecords.count}件`);
    console.log(`ユニーク楽曲数: ${totalRecords.unique_songs}曲`);
    console.log(`記録期間: ${dayjs.unix(totalRecords.first_date).format('YYYY-MM-DD')} ～ ${dayjs.unix(totalRecords.last_date).format('YYYY-MM-DD')}`);
    console.log('');

    // 複数日プレイされている楽曲を検索
    console.log('--- 複数日プレイ楽曲の検索 ---');
    const multiDaySongs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, 
                COUNT(*) as play_count,
                COUNT(DISTINCT DATE(datetime(date, 'unixepoch'))) as play_days,
                MIN(date) as first_play,
                MAX(date) as last_play,
                MAX(score) as best_score
         FROM scorelog 
         GROUP BY sha256 
         HAVING play_days > 1 
         ORDER BY play_days DESC, play_count DESC 
         LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (multiDaySongs.length > 0) {
      console.log(`✅ 複数日プレイ楽曲: ${multiDaySongs.length}曲見つかりました`);
      multiDaySongs.forEach((song, index) => {
        console.log(`${index + 1}. SHA256: ${song.sha256.substring(0, 16)}...`);
        console.log(`   プレイ回数: ${song.play_count}回, プレイ日数: ${song.play_days}日`);
        console.log(`   期間: ${dayjs.unix(song.first_play).format('YYYY-MM-DD')} ～ ${dayjs.unix(song.last_play).format('YYYY-MM-DD')}`);
        console.log(`   ベストスコア: ${song.best_score}`);
      });
    } else {
      console.log('❌ 複数日プレイ楽曲が見つかりませんでした');
    }
    console.log('');

    // 8/4の記録を検索
    console.log('--- 8/4の記録検索 ---');
    const targetDate = dayjs('2025-08-04');
    const start = targetDate.startOf('day').unix();
    const end = targetDate.endOf('day').unix();

    const aug4Records = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, mode, clear, oldclear, score, oldscore, 
                combo, oldcombo, minbp, oldminbp, date
         FROM scorelog 
         WHERE date BETWEEN ? AND ?
         ORDER BY date ASC
         LIMIT 20`,
        [start, end],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (aug4Records.length > 0) {
      console.log(`✅ 8/4の記録: ${aug4Records.length}件見つかりました（最初の20件表示）`);
      aug4Records.forEach((record, index) => {
        const playTime = dayjs.unix(record.date).format('HH:mm:ss');
        const scoreDiff = record.score - record.oldscore;
        const missDiff = record.oldminbp - record.minbp;
        const clearDiff = record.clear - record.oldclear;
        
        console.log(`${index + 1}. ${playTime} SHA256: ${record.sha256.substring(0, 12)}...`);
        console.log(`   スコア: ${record.oldscore} → ${record.score} (${scoreDiff > 0 ? '+' : ''}${scoreDiff})`);
        console.log(`   MISS: ${record.oldminbp} → ${record.minbp} (${missDiff > 0 ? '-' : '+'}${Math.abs(missDiff)})`);
        console.log(`   クリア: ${record.oldclear} → ${record.clear} (${clearDiff > 0 ? '+' : ''}${clearDiff})`);
      });
    } else {
      console.log('❌ 8/4の記録が見つかりませんでした');
    }
    console.log('');

    // 大きなスコア差分がある記録を検索
    console.log('--- 大きなスコア改善記録 (差分+10以上) ---');
    const bigImprovements = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, mode, clear, oldclear, score, oldscore, 
                combo, oldcombo, minbp, oldminbp, date,
                (score - oldscore) as score_diff
         FROM scorelog 
         WHERE score - oldscore >= 10
         ORDER BY score_diff DESC 
         LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (bigImprovements.length > 0) {
      console.log(`✅ 大きなスコア改善: ${bigImprovements.length}件見つかりました`);
      bigImprovements.forEach((record, index) => {
        const playTime = dayjs.unix(record.date).format('YYYY-MM-DD HH:mm:ss');
        console.log(`${index + 1}. ${playTime} SHA256: ${record.sha256.substring(0, 12)}...`);
        console.log(`   スコア改善: ${record.oldscore} → ${record.score} (+${record.score_diff})`);
        console.log(`   MISS: ${record.oldminbp} → ${record.minbp}`);
        console.log(`   クリア: ${record.oldclear} → ${record.clear}`);
      });
    } else {
      console.log('❌ 大きなスコア改善記録が見つかりませんでした');
    }

    // A.S.D.F [EX]のSHA256で検索してみる
    console.log('');
    console.log('--- A.S.D.F [EX] 記録検索 ---');
    const asdfSHA256 = 'aa9acef340b8c76b71b3b61d92a29a41c88a76095e6de1cc9fbdf0fb7dd1a59e'; // A.S.D.F [EX]のSHA256
    
    const asdfRecords = await new Promise((resolve, reject) => {
      db.all(
        `SELECT mode, clear, oldclear, score, oldscore, 
                combo, oldcombo, minbp, oldminbp, date,
                (score - oldscore) as score_diff
         FROM scorelog 
         WHERE sha256 = ?
         ORDER BY date ASC`,
        [asdfSHA256],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (asdfRecords.length > 0) {
      console.log(`✅ A.S.D.F [EX]の記録: ${asdfRecords.length}件見つかりました`);
      asdfRecords.forEach((record, index) => {
        const playTime = dayjs.unix(record.date).format('YYYY-MM-DD HH:mm:ss');
        console.log(`${index + 1}. ${playTime}`);
        console.log(`   スコア: ${record.oldscore} → ${record.score} (${record.score_diff > 0 ? '+' : ''}${record.score_diff})`);
        console.log(`   MISS: ${record.oldminbp} → ${record.minbp}`);
        console.log(`   クリア: ${record.oldclear} → ${record.clear}`);
      });
    } else {
      console.log('❌ A.S.D.F [EX]の記録が見つかりませんでした');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

// テスト実行
testScorelogStructure().then(() => {
  console.log('\n=== テスト完了 ===');
}).catch(error => {
  console.error('テスト実行エラー:', error);
});
