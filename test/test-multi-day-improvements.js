const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const fs = require('fs');

// config.jsonからパスを読み込み
let config;
try {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (error) {
  console.error('config.json読み込みエラー:', error);
  process.exit(1);
}

async function testMultiDayScoreImprovement() {
  const scoredatalogPath = config.dbPaths.scoredatalog;
  
  if (!fs.existsSync(scoredatalogPath)) {
    console.error('scoredatalog.dbが見つかりません:', scoredatalogPath);
    return;
  }
  
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  try {
    // 複数日でプレイされている楽曲を検索
    const multiDaySongs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, COUNT(DISTINCT date(date, 'unixepoch')) as play_days, 
                MIN(date) as first_play, MAX(date) as last_play
         FROM scoredatalog 
         GROUP BY sha256 
         HAVING play_days >= 2 
         ORDER BY play_days DESC 
         LIMIT 3`,
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    
    console.log('複数日でプレイされている楽曲:');
    
    for (const song of multiDaySongs) {
      console.log(`\n--- SHA256: ${song.sha256.substring(0, 16)}... ---`);
      console.log(`プレイ日数: ${song.play_days}日`);
      console.log(`初回: ${dayjs.unix(song.first_play).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`最新: ${dayjs.unix(song.last_play).format('YYYY-MM-DD HH:mm:ss')}`);
      
      // 各日のベストスコアを取得
      const dailyBests = await new Promise((resolve, reject) => {
        db.all(
          `SELECT date(date, 'unixepoch') as play_date,
                  MAX((epg + lpg) * 2 + (egr + lgr) * 1) as best_score,
                  MIN(minbp) as best_miss,
                  MAX(clear) as best_clear
           FROM scoredatalog 
           WHERE sha256 = ?
           GROUP BY date(date, 'unixepoch')
           ORDER BY play_date`,
          [song.sha256],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      
      console.log('日別ベスト記録:');
      let previousBest = null;
      
      for (const daily of dailyBests) {
        let improvements = [];
        
        if (previousBest) {
          if (daily.best_score > previousBest.best_score) {
            improvements.push(`スコア+${daily.best_score - previousBest.best_score}`);
          }
          if (daily.best_miss < previousBest.best_miss) {
            improvements.push(`MISS-${previousBest.best_miss - daily.best_miss}`);
          }
          if (daily.best_clear > previousBest.best_clear) {
            improvements.push(`クリア${previousBest.best_clear}→${daily.best_clear}`);
          }
        }
        
        const improvementText = improvements.length > 0 ? ` [${improvements.join(', ')}]` : '';
        console.log(`  ${daily.play_date}: スコア=${daily.best_score}, MISS=${daily.best_miss}, クリア=${daily.best_clear}${improvementText}`);
        
        previousBest = daily;
      }
    }
    
  } catch (error) {
    console.error('テストエラー:', error);
  } finally {
    db.close();
  }
}

testMultiDayScoreImprovement();
