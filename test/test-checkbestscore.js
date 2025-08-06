const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');

// checkbestscore関数の単体テスト用スクリプト
function testCheckBestScore() {
  console.log('=== checkbestscore関数テスト ===');
  
  const scoredatalogDb = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  const songdataDb = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);
  
  // 複数日にまたがってプレイされた楽曲を探す
  scoredatalogDb.all(`
    SELECT sha256, 
           COUNT(DISTINCT DATE(datetime(date, 'unixepoch'))) as day_count,
           COUNT(*) as play_count,
           MIN(date) as first_play,
           MAX(date) as last_play
    FROM scoredatalog 
    GROUP BY sha256 
    HAVING day_count >= 2
    ORDER BY day_count DESC, play_count DESC
    LIMIT 5
  `, (err, multiDaySongs) => {
    if (err) {
      console.error('複数日楽曲検索エラー:', err);
      return;
    }
    
    console.log(`複数日にまたがってプレイされた楽曲: ${multiDaySongs.length}件`);
    
    multiDaySongs.forEach((song, index) => {
      const firstDate = dayjs.unix(song.first_play).format('YYYY-MM-DD');
      const lastDate = dayjs.unix(song.last_play).format('YYYY-MM-DD');
      console.log(`\n${index + 1}. SHA256: ${song.sha256.substring(0, 8)}... (${song.day_count}日間, ${song.play_count}回プレイ, ${firstDate}～${lastDate})`);
      
      // 楽曲名を取得
      songdataDb.get(`SELECT title, artist FROM song WHERE sha256 = ?`, [song.sha256], (err, songInfo) => {
        if (songInfo) {
          console.log(`   楽曲: ${songInfo.title} [${songInfo.artist}]`);
        }
        
        // この楽曲の日別ベストスコアを計算
        calculateDailyBestScores(song.sha256, scoredatalogDb);
      });
    });
    
    // 5秒後にデータベースを閉じる
    setTimeout(() => {
      scoredatalogDb.close();
      songdataDb.close();
      console.log('\n=== テスト完了 ===');
    }, 5000);
  });
}

function calculateDailyBestScores(sha256, db) {
  // 日別の全プレイデータを取得
  db.all(`
    SELECT 
      DATE(datetime(date, 'unixepoch')) as play_date,
      (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
      minbp, clear, date
    FROM scoredatalog 
    WHERE sha256 = ?
    ORDER BY date ASC
  `, [sha256], (err, allPlays) => {
    if (err) {
      console.error('プレイデータ取得エラー:', err);
      return;
    }
    
    // 日別にグループ化してベストスコアを計算
    const dailyBests = {};
    const dailyPlays = {};
    
    allPlays.forEach(play => {
      const date = play.play_date;
      
      if (!dailyPlays[date]) {
        dailyPlays[date] = [];
        dailyBests[date] = {
          exscore: play.exscore,
          minbp: play.minbp,
          clear: play.clear
        };
      }
      
      dailyPlays[date].push(play);
      
      // ベストスコア更新判定
      const current = dailyBests[date];
      if (play.exscore > current.exscore || 
          (play.exscore === current.exscore && play.minbp < current.minbp) ||
          (play.exscore === current.exscore && play.minbp === current.minbp && play.clear > current.clear)) {
        dailyBests[date] = {
          exscore: play.exscore,
          minbp: play.minbp,
          clear: play.clear
        };
      }
    });
    
    // 結果表示
    const dates = Object.keys(dailyBests).sort();
    console.log(`   日別ベストスコア:`);
    
    dates.forEach((date, index) => {
      const best = dailyBests[date];
      const playCount = dailyPlays[date].length;
      console.log(`     ${date}: スコア=${best.exscore}, MISS=${best.minbp}, クリア=${best.clear} (${playCount}回プレイ)`);
      
      // 前日からの差分計算
      if (index > 0) {
        const prevDate = dates[index - 1];
        const prevBest = dailyBests[prevDate];
        
        const scoreDiff = best.exscore - prevBest.exscore;
        const missDiff = prevBest.minbp - best.minbp;
        const clearDiff = best.clear - prevBest.clear;
        
        const improvements = [];
        if (scoreDiff > 0) improvements.push(`スコア+${scoreDiff}`);
        if (missDiff > 0) improvements.push(`MISS-${missDiff}`);
        if (clearDiff > 0) improvements.push(`クリア+${clearDiff}`);
        
        if (improvements.length > 0) {
          console.log(`       ★前日からの改善: ${improvements.join(', ')}`);
        }
      }
    });
  });
}

// テスト実行
testCheckBestScore();
