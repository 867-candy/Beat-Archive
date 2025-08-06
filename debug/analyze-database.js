const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const scoredatalogPath = path.join(sampleDbPath, 'scoredatalog.db');
const songdataPath = path.join(sampleDbPath, 'songdata.db');

async function analyzeDatabase() {
  console.log('=== scoredatalog データベース分析 ===');
  console.log(`DB Path: ${scoredatalogPath}`);
  console.log('');

  const scoredatalogDB = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  const songdataDB = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

  try {
    // 1. 全記録数
    const totalRecords = await new Promise((resolve, reject) => {
      scoredatalogDB.get(
        `SELECT COUNT(*) as count FROM scoredatalog`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    console.log(`総記録数: ${totalRecords}件`);

    // 2. ユニークな楽曲数
    const uniqueSongs = await new Promise((resolve, reject) => {
      scoredatalogDB.get(
        `SELECT COUNT(DISTINCT sha256) as count FROM scoredatalog`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    console.log(`ユニーク楽曲数: ${uniqueSongs}曲`);

    // 3. 日付範囲
    const dateRange = await new Promise((resolve, reject) => {
      scoredatalogDB.get(
        `SELECT 
          MIN(date) as min_date, 
          MAX(date) as max_date,
          COUNT(DISTINCT DATE(date, 'unixepoch')) as unique_days
         FROM scoredatalog`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    console.log(`記録期間: ${dayjs.unix(dateRange.min_date).format('YYYY-MM-DD HH:mm:ss')} - ${dayjs.unix(dateRange.max_date).format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`ユニーク日数: ${dateRange.unique_days}日`);

    // 4. 日別記録数
    console.log('\n--- 日別記録数 (上位10日) ---');
    const dailyStats = await new Promise((resolve, reject) => {
      scoredatalogDB.all(
        `SELECT 
          DATE(date, 'unixepoch') as play_date,
          COUNT(*) as record_count,
          COUNT(DISTINCT sha256) as unique_songs
         FROM scoredatalog 
         GROUP BY DATE(date, 'unixepoch')
         ORDER BY record_count DESC
         LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    dailyStats.forEach((day, index) => {
      console.log(`${index + 1}. ${day.play_date}: ${day.record_count}記録, ${day.unique_songs}曲`);
    });

    // 5. 楽曲ごとの記録数（上位10曲）
    console.log('\n--- 楽曲別記録数 (上位10曲) ---');
    const songStats = await new Promise((resolve, reject) => {
      scoredatalogDB.all(
        `SELECT 
          sha256,
          COUNT(*) as play_count,
          COUNT(DISTINCT DATE(date, 'unixepoch')) as play_days,
          MIN(date) as first_play,
          MAX(date) as last_play
         FROM scoredatalog 
         GROUP BY sha256
         ORDER BY play_count DESC
         LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    for (let i = 0; i < songStats.length; i++) {
      const song = songStats[i];
      
      // 楽曲名を取得
      const songInfo = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT title, artist FROM song WHERE sha256 = ?`,
          [song.sha256],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const title = songInfo?.title || '[タイトル不明]';
      const firstPlay = dayjs.unix(song.first_play).format('YYYY-MM-DD');
      const lastPlay = dayjs.unix(song.last_play).format('YYYY-MM-DD');
      
      console.log(`${i + 1}. ${title.substring(0, 30)}${title.length > 30 ? '...' : ''}`);
      console.log(`   SHA256: ${song.sha256.substring(0, 12)}...`);
      console.log(`   プレイ回数: ${song.play_count}回, プレイ日数: ${song.play_days}日`);
      console.log(`   期間: ${firstPlay} - ${lastPlay}`);
    }

    // 6. 複数日プレイの詳細チェック
    console.log('\n--- 複数日プレイ詳細チェック ---');
    const detailedCheck = await new Promise((resolve, reject) => {
      scoredatalogDB.all(
        `SELECT 
          sha256,
          COUNT(DISTINCT DATE(date, 'unixepoch')) as day_count,
          GROUP_CONCAT(DISTINCT DATE(date, 'unixepoch')) as play_dates
         FROM scoredatalog 
         GROUP BY sha256
         HAVING day_count > 1
         ORDER BY day_count DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (detailedCheck.length > 0) {
      console.log(`✅ ${detailedCheck.length}曲が複数日にプレイされています`);
      detailedCheck.forEach((song, index) => {
        console.log(`${index + 1}. SHA256: ${song.sha256.substring(0, 12)}..., ${song.day_count}日間, 日付: ${song.play_dates}`);
      });
    } else {
      console.log('❌ 複数日にプレイされた楽曲はありません');
      console.log('すべての楽曲が単一日のみのプレイ記録です');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    scoredatalogDB.close();
    songdataDB.close();
  }
}

// 実行
analyzeDatabase().then(() => {
  console.log('\n=== 分析完了 ===');
}).catch(error => {
  console.error('分析エラー:', error);
});
