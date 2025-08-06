const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const scoredatalogPath = path.join(sampleDbPath, 'scoredatalog.db');
const songdataPath = path.join(sampleDbPath, 'songdata.db');

async function findMultiDaySongs() {
  console.log('=== 複数日記録がある楽曲検索 ===');
  console.log(`scoredatalog DB: ${scoredatalogPath}`);
  console.log(`songdata DB: ${songdataPath}`);
  console.log('');

  const scoredatalogDB = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  const songdataDB = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

  try {
    // 複数日に記録がある楽曲を検索（日付をYYYY-MM-DD形式にグループ化）
    console.log('--- 複数日記録検索中... ---');
    const multiDaySongs = await new Promise((resolve, reject) => {
      scoredatalogDB.all(
        `SELECT 
          sha256,
          COUNT(DISTINCT DATE(date, 'unixepoch')) as day_count,
          COUNT(*) as total_plays,
          MIN(date) as first_play,
          MAX(date) as last_play,
          MIN((epg + lpg) * 2 + (egr + lgr) * 1) as min_score,
          MAX((epg + lpg) * 2 + (egr + lgr) * 1) as max_score
         FROM scoredatalog 
         GROUP BY sha256
         HAVING day_count > 1
         ORDER BY day_count DESC, total_plays DESC
         LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (multiDaySongs.length === 0) {
      console.log('❌ 複数日に記録がある楽曲が見つかりませんでした');
      return;
    }

    console.log(`✅ ${multiDaySongs.length}曲の複数日記録楽曲が見つかりました`);
    console.log('');

    // 上位3曲の詳細情報を取得
    const topThreeSongs = multiDaySongs.slice(0, 3);
    
    for (let i = 0; i < topThreeSongs.length; i++) {
      const songRecord = topThreeSongs[i];
      const sha256 = songRecord.sha256;
      
      console.log(`=== 第${i + 1}位: SHA256=${sha256.substring(0, 12)}... ===`);
      console.log(`プレイ日数: ${songRecord.day_count}日間`);
      console.log(`総プレイ回数: ${songRecord.total_plays}回`);
      console.log(`初回プレイ: ${dayjs.unix(songRecord.first_play).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`最終プレイ: ${dayjs.unix(songRecord.last_play).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`スコア範囲: ${songRecord.min_score} - ${songRecord.max_score}`);

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
      } else {
        console.log(`楽曲名: [楽曲情報が見つかりません]`);
      }

      // 日別記録詳細を取得
      const dailyRecords = await new Promise((resolve, reject) => {
        scoredatalogDB.all(
          `SELECT 
            DATE(date, 'unixepoch') as play_date,
            COUNT(*) as play_count,
            MIN((epg + lpg) * 2 + (egr + lgr) * 1) as min_score,
            MAX((epg + lpg) * 2 + (egr + lgr) * 1) as max_score,
            MIN(minbp) as best_miss,
            MAX(clear) as best_clear
           FROM scoredatalog 
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

      console.log(`日別記録詳細:`);
      dailyRecords.forEach((record, index) => {
        console.log(`  ${index + 1}. ${record.play_date}: ${record.play_count}回プレイ, スコア${record.min_score}-${record.max_score}, MISS${record.best_miss}, クリア${record.best_clear}`);
      });

      console.log('');
    }

    // 全体統計
    console.log('=== 全体統計 ===');
    const stats = await new Promise((resolve, reject) => {
      scoredatalogDB.get(
        `SELECT 
          COUNT(DISTINCT sha256) as total_songs,
          COUNT(DISTINCT sha256) FILTER (WHERE day_count > 1) as multi_day_songs,
          MAX(day_count) as max_days,
          AVG(total_plays) as avg_plays
         FROM (
           SELECT 
             sha256,
             COUNT(DISTINCT DATE(date, 'unixepoch')) as day_count,
             COUNT(*) as total_plays
           FROM scoredatalog 
           GROUP BY sha256
         )`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    console.log(`総楽曲数: ${stats.total_songs}曲`);
    console.log(`複数日記録楽曲数: ${multiDaySongs.length}曲`);
    console.log(`最大プレイ日数: ${multiDaySongs[0]?.day_count || 0}日`);
    console.log(`平均プレイ回数: ${stats.avg_plays?.toFixed(1) || 0}回`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    scoredatalogDB.close();
    songdataDB.close();
  }
}

// 実行
findMultiDaySongs().then(() => {
  console.log('\n=== 検索完了 ===');
}).catch(error => {
  console.error('実行エラー:', error);
});
