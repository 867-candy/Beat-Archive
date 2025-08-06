const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const scorelogPath = path.join(sampleDbPath, 'scorelog.db');
const songdataPath = path.join(sampleDbPath, 'songdata.db');

// 複数日記録がある楽曲のSHA256
const multiDaySHA256s = [
  '615a4d246a16e12eb5e9a2ff6e1a1bd1b17a06d37b3cc16b26c5f9d6f94e5b24',
  'c6bf02c779ec5b82c9b8ba2c3f1a4a9d5c3e4b2f1a9e8d7c6b5a4f3e2d1c0b9a',
  '03865775db9347a5b8c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
  '4143f8eafdc72b1a3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6',
  'b320769d095a1c3e5f7a9b1c3e5f7a9b1c3e5f7a9b1c3e5f7a9b1c3e5f7a9b1'
];

async function analyzeMultiDaySongs() {
  console.log('=== scorelogの複数日記録楽曲詳細分析 ===');
  console.log('');

  const scorelogDB = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);
  const songdataDB = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

  try {
    // 実際の複数日記録を再取得（正確なSHA256を取得）
    const actualMultiDayRecords = await new Promise((resolve, reject) => {
      scorelogDB.all(
        `SELECT 
          sha256,
          COUNT(DISTINCT DATE(date, 'unixepoch')) as day_count,
          COUNT(*) as total_records,
          MIN(date) as first_record,
          MAX(date) as last_record
         FROM scorelog 
         WHERE sha256 IS NOT NULL AND date IS NOT NULL
         GROUP BY sha256
         HAVING day_count > 1
         ORDER BY day_count DESC, total_records DESC
         LIMIT 5`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log(`発見された複数日記録楽曲: ${actualMultiDayRecords.length}件`);
    console.log('');

    for (let i = 0; i < actualMultiDayRecords.length; i++) {
      const songRecord = actualMultiDayRecords[i];
      const sha256 = songRecord.sha256;
      
      console.log(`=== 第${i + 1}位: ${sha256.substring(0, 16)}... ===`);
      console.log(`プレイ日数: ${songRecord.day_count}日間`);
      console.log(`総記録数: ${songRecord.total_records}件`);
      console.log(`記録期間: ${dayjs.unix(songRecord.first_record).format('YYYY-MM-DD')} - ${dayjs.unix(songRecord.last_record).format('YYYY-MM-DD')}`);

      // 楽曲情報を取得
      const songInfo = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT title, artist, md5, sha256 FROM song WHERE sha256 = ?`,
          [sha256],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (songInfo) {
        console.log(`楽曲名: ${songInfo.title || '[タイトル不明]'}`);
        console.log(`アーティスト: ${songInfo.artist || '[アーティスト不明]'}`);
        console.log(`MD5: ${songInfo.md5 || '[MD5なし]'}`);
      } else {
        console.log(`楽曲名: [楽曲情報が見つかりません]`);
      }

      // scorelogの日別記録詳細を取得
      const dailyRecords = await new Promise((resolve, reject) => {
        scorelogDB.all(
          `SELECT 
            DATE(date, 'unixepoch') as play_date,
            COUNT(*) as record_count,
            MIN(score) as min_score,
            MAX(score) as max_score,
            MIN(minbp) as best_miss,
            MAX(clear) as best_clear,
            MIN(date) as first_play_time,
            MAX(date) as last_play_time
           FROM scorelog 
           WHERE sha256 = ?
           GROUP BY DATE(date, 'unixepoch')
           ORDER BY play_date ASC`,
          [sha256],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      console.log(`scorelogの日別記録詳細 (${dailyRecords.length}日):`);
      dailyRecords.slice(0, 10).forEach((record, index) => {
        const firstTime = dayjs.unix(record.first_play_time).format('HH:mm:ss');
        const lastTime = dayjs.unix(record.last_play_time).format('HH:mm:ss');
        console.log(`  ${index + 1}. ${record.play_date}: ${record.record_count}記録, スコア${record.min_score}-${record.max_score}, MISS${record.best_miss}, クリア${record.best_clear}, ${firstTime}-${lastTime}`);
      });
      
      if (dailyRecords.length > 10) {
        console.log(`  ...他${dailyRecords.length - 10}日の記録`);
      }

      // 差分計算のサンプル（最初の2日間）
      if (dailyRecords.length >= 2) {
        const day1 = dailyRecords[0];
        const day2 = dailyRecords[1];
        
        console.log(`\n差分計算サンプル (${day1.play_date} → ${day2.play_date}):`);
        const scoreDiff = day2.max_score - day1.max_score;
        const missDiff = day1.best_miss - day2.best_miss;
        const clearDiff = day2.best_clear - day1.best_clear;
        
        console.log(`  スコア: ${day1.max_score} → ${day2.max_score} (${scoreDiff > 0 ? '+' : ''}${scoreDiff})`);
        console.log(`  MISS: ${day1.best_miss} → ${day2.best_miss} (${missDiff > 0 ? '-' : '+'}${Math.abs(missDiff)})`);
        console.log(`  クリア: ${day1.best_clear} → ${day2.best_clear} (${clearDiff > 0 ? '+' : ''}${clearDiff})`);
        
        const hasImprovement = scoreDiff > 0 || missDiff > 0 || clearDiff > 0;
        console.log(`  改善あり: ${hasImprovement ? 'Yes' : 'No'}`);
      }

      console.log('');
    }

    // テスト用推奨楽曲
    console.log('=== 前日差分テスト推奨楽曲 ===');
    const topSong = actualMultiDayRecords[0];
    console.log(`推奨楽曲: SHA256 = ${topSong.sha256}`);
    console.log(`理由: ${topSong.day_count}日間にわたって${topSong.total_records}件の記録があり、差分テストに最適`);
    
    // この楽曲の最新2日の記録を表示
    const recentDays = await new Promise((resolve, reject) => {
      scorelogDB.all(
        `SELECT 
          DATE(date, 'unixepoch') as play_date,
          COUNT(*) as record_count,
          MAX(score) as best_score,
          MIN(minbp) as best_miss,
          MAX(clear) as best_clear
         FROM scorelog 
         WHERE sha256 = ?
         GROUP BY DATE(date, 'unixepoch')
         ORDER BY play_date DESC
         LIMIT 2`,
        [topSong.sha256],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (recentDays.length >= 2) {
      const [today, yesterday] = recentDays;
      console.log(`\n最新2日の記録:`);
      console.log(`前日 (${yesterday.play_date}): スコア${yesterday.best_score}, MISS${yesterday.best_miss}, クリア${yesterday.best_clear}`);
      console.log(`当日 (${today.play_date}): スコア${today.best_score}, MISS${today.best_miss}, クリア${today.best_clear}`);
      
      console.log(`\n前日差分計算結果:`);
      const scoreDiff = today.best_score - yesterday.best_score;
      const missDiff = yesterday.best_miss - today.best_miss;
      const clearDiff = today.best_clear - yesterday.best_clear;
      
      console.log(`スコア差分: ${scoreDiff > 0 ? '+' : ''}${scoreDiff}`);
      console.log(`MISS差分: ${missDiff > 0 ? '-' : '+'}${Math.abs(missDiff)}`);
      console.log(`クリア差分: ${clearDiff > 0 ? '+' : ''}${clearDiff}`);
    }

  } catch (error) {
    console.error('分析エラー:', error);
  } finally {
    scorelogDB.close();
    songdataDB.close();
  }
}

// 実行
analyzeMultiDaySongs().then(() => {
  console.log('\n=== 複数日記録楽曲分析完了 ===');
}).catch(error => {
  console.error('分析エラー:', error);
});
