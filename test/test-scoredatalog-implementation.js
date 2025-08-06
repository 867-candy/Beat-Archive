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

// scoredatalogベースの改善差分を計算する関数（実装テスト）
async function calculateScoredatalogUpdates(sha256, targetDate, scoredatalogDB, scoredatalogTableName) {
  try {
    const start = targetDate.startOf('day').unix();
    const end = targetDate.endOf('day').unix();
    
    // その日のプレイ記録を取得
    const todayPlays = await new Promise((resolve, reject) => {
      scoredatalogDB.all(
        `SELECT epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, 
                minbp, clear, date 
         FROM ${scoredatalogTableName} 
         WHERE sha256 = ? AND date BETWEEN ? AND ? 
         ORDER BY date ASC`,
        [sha256, start, end],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    
    if (todayPlays.length === 0) return [];
    
    // その日より前の最高記録を取得
    const previousBest = await new Promise((resolve, reject) => {
      scoredatalogDB.get(
        `SELECT epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, 
                minbp, clear, date 
         FROM ${scoredatalogTableName} 
         WHERE sha256 = ? AND date < ?
         ORDER BY date DESC LIMIT 1`,
        [sha256, start],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });
    
    // その日の最高記録を計算
    const todayBest = todayPlays.reduce((best, play) => {
      const playScore = (play.epg + play.lpg) * 2 + (play.egr + play.lgr) * 1;
      const bestScore = best ? (best.epg + best.lpg) * 2 + (best.egr + best.lgr) * 1 : -1;
      
      // スコア改善、またはMISS減少、またはクリア改善があるかチェック
      if (!best || 
          playScore > bestScore || 
          play.minbp < best.minbp || 
          play.clear > best.clear) {
        return play;
      }
      return best;
    }, null);
    
    if (!todayBest) return [];
    
    const updates = [];
    
    if (previousBest) {
      // EXスコア改善
      const previousScore = (previousBest.epg + previousBest.lpg) * 2 + (previousBest.egr + previousBest.lgr) * 1;
      const todayScore = (todayBest.epg + todayBest.lpg) * 2 + (todayBest.egr + todayBest.lgr) * 1;
      
      if (todayScore > previousScore) {
        updates.push({
          type: 'scoredatalog_score',
          old: previousScore,
          new: todayScore,
          improvement: todayScore - previousScore
        });
      }
      
      // MISS改善（減少した場合のみ）
      if (todayBest.minbp < previousBest.minbp) {
        updates.push({
          type: 'scoredatalog_miss',
          old: previousBest.minbp,
          new: todayBest.minbp,
          improvement: previousBest.minbp - todayBest.minbp
        });
      }
      
      // クリア改善（向上した場合のみ）
      if (todayBest.clear > previousBest.clear) {
        updates.push({
          type: 'scoredatalog_clear',
          old: previousBest.clear,
          new: todayBest.clear
        });
      }
    } else {
      // 初回プレイの場合、結果を記録（改善として扱わない）
      const todayScore = (todayBest.epg + todayBest.lpg) * 2 + (todayBest.egr + todayBest.lgr) * 1;
      updates.push({
        type: 'scoredatalog_first_play',
        score: todayScore,
        miss: todayBest.minbp,
        clear: todayBest.clear
      });
    }
    
    return updates;
  } catch (error) {
    console.error(`scoredatalog差分計算エラー (SHA256: ${sha256}):`, error);
    return [];
  }
}

async function testScoredatalogImplementation() {
  const scoredatalogPath = config.dbPaths.scoredatalog;
  
  if (!fs.existsSync(scoredatalogPath)) {
    console.error('scoredatalog.dbが見つかりません:', scoredatalogPath);
    return;
  }
  
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  try {
    // テスト用の日付
    const testDate = dayjs('2025-08-04');
    console.log(`テスト日付: ${testDate.format('YYYY-MM-DD')}`);
    
    // その日にプレイされた楽曲を取得
    const playedSongs = await new Promise((resolve, reject) => {
      const start = testDate.startOf('day').unix();
      const end = testDate.endOf('day').unix();
      
      db.all(
        `SELECT DISTINCT sha256 FROM scoredatalog WHERE date BETWEEN ? AND ? LIMIT 5`,
        [start, end],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    
    console.log(`\n${testDate.format('YYYY-MM-DD')}にプレイされた楽曲数: ${playedSongs.length}`);
    
    // 各楽曲の差分計算をテスト
    for (const song of playedSongs) {
      console.log(`\n--- SHA256: ${song.sha256.substring(0, 16)}... ---`);
      
      const updates = await calculateScoredatalogUpdates(song.sha256, testDate, db, 'scoredatalog');
      
      if (updates.length > 0) {
        console.log('改善検出:');
        updates.forEach(update => {
          switch (update.type) {
            case 'scoredatalog_score':
              console.log(`  EXスコア: ${update.old} → ${update.new} (+${update.improvement})`);
              break;
            case 'scoredatalog_miss':
              console.log(`  MISS: ${update.old} → ${update.new} (-${update.improvement})`);
              break;
            case 'scoredatalog_clear':
              console.log(`  クリア: ${update.old} → ${update.new}`);
              break;
            case 'scoredatalog_first_play':
              console.log(`  初回プレイ: スコア=${update.score}, MISS=${update.miss}, クリア=${update.clear}`);
              break;
          }
        });
      } else {
        console.log('  改善なし');
      }
    }
    
  } catch (error) {
    console.error('テストエラー:', error);
  } finally {
    db.close();
  }
}

testScoredatalogImplementation();
