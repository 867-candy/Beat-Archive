const Database = require('better-sqlite3');
const scoredatalogDb = new Database('./sample-db/scoredatalog.db', { readonly: true });
const songdataDb = new Database('./sample-db/songdata.db', { readonly: true });

console.log('=== scoredatalogベース差分計算テスト ===');

// scoredatalogの全期間データを確認
const allData = scoredatalogDb.prepare('SELECT COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date FROM scoredatalog').get();
console.log(`scoredatalog全データ: ${allData.count}件`);
console.log(`期間: ${new Date(allData.min_date * 1000).toLocaleDateString()} - ${new Date(allData.max_date * 1000).toLocaleDateString()}`);

// 複数プレイのある楽曲で差分計算テスト
console.log('\n=== 複数プレイのある楽曲で差分計算テスト ===');

const multiplePlaySongs = scoredatalogDb.prepare(`
  SELECT sha256, mode, COUNT(*) as play_count 
  FROM scoredatalog 
  GROUP BY sha256, mode 
  HAVING COUNT(*) > 1 
  ORDER BY play_count DESC 
  LIMIT 3
`).all();

multiplePlaySongs.forEach((songKey, index) => {
  console.log(`\n--- ${index + 1}. 楽曲 ${songKey.sha256.substring(0, 16)}... mode:${songKey.mode} (${songKey.play_count}回プレイ) ---`);
  
  // 楽曲情報を取得
  const songInfo = songdataDb.prepare('SELECT title, artist FROM song WHERE sha256 = ?').get(songKey.sha256);
  console.log(`楽曲名: ${songInfo?.title || 'Unknown'} / ${songInfo?.artist || 'Unknown'}`);
  
  // 全プレイ記録を時系列順で取得
  const allPlays = scoredatalogDb.prepare(`
    SELECT 
      clear, minbp, combo, date,
      (epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as totalNotes,
      (epg + lpg) as pgreat
    FROM scoredatalog 
    WHERE sha256 = ? AND mode = ?
    ORDER BY date ASC
  `).all(songKey.sha256, songKey.mode);
  
  console.log(`全プレイ回数: ${allPlays.length}回`);
  
  // 差分計算のシミュレーション（中間記録との比較）
  if (allPlays.length >= 3) {
    const firstPlay = allPlays[0];
    const middlePlay = allPlays[Math.floor(allPlays.length / 2)];
    const lastPlay = allPlays[allPlays.length - 1];
    
    console.log(`\n差分計算例: 中間記録 vs 最終記録`);
    console.log(`中間記録: ${new Date(middlePlay.date * 1000).toLocaleDateString()} Clear:${middlePlay.clear} MISS:${middlePlay.minbp} Combo:${middlePlay.combo}`);
    console.log(`最終記録: ${new Date(lastPlay.date * 1000).toLocaleDateString()} Clear:${lastPlay.clear} MISS:${lastPlay.minbp} Combo:${lastPlay.combo}`);
    
    // 実際の差分計算ロジック
    function calculateDifferences(prev, current) {
      const diffs = [];
      
      // スコア差分（PGREATで簡易計算）
      if (current.pgreat > prev.pgreat) {
        diffs.push({
          type: 'score',
          old: prev.pgreat,
          new: current.pgreat,
          diff: current.pgreat - prev.pgreat
        });
      }
      
      // クリア差分
      if (current.clear > prev.clear) {
        diffs.push({
          type: 'clear',
          old: prev.clear,
          new: current.clear,
          diff: current.clear - prev.clear
        });
      }
      
      // MISS差分（改善のみ）
      if (current.minbp < prev.minbp) {
        diffs.push({
          type: 'miss',
          old: prev.minbp,
          new: current.minbp,
          diff: current.minbp - prev.minbp
        });
      }
      
      return diffs;
    }
    
    const improvements = calculateDifferences(middlePlay, lastPlay);
    
    if (improvements.length > 0) {
      console.log('改善項目:');
      improvements.forEach(diff => {
        switch(diff.type) {
          case 'score':
            console.log(`  スコア向上: ${diff.old} → ${diff.new} (+${diff.diff})`);
            break;
          case 'clear':
            console.log(`  クリア向上: ${diff.old} → ${diff.new}`);
            break;
          case 'miss':
            console.log(`  MISS減少: ${diff.old} → ${diff.new} (${diff.diff})`);
            break;
        }
      });
    } else {
      console.log('  改善なし');
    }
  }
});

// 具体的な実装例（main.jsで使用する形式）
console.log('\n=== 実装例: getUpdatedSongsでの差分計算 ===');
console.log(`
function calculateScoredatalogDifferences(targetDate) {
  const startOfDay = new Date(targetDate).getTime() / 1000;
  const endOfDay = startOfDay + 24 * 60 * 60;
  
  // その日にプレイした楽曲を取得
  const todayPlays = scoredatalogDb.prepare(\`
    SELECT DISTINCT sha256, mode 
    FROM scoredatalog 
    WHERE date >= ? AND date < ?
  \`).all(startOfDay, endOfDay);
  
  const results = [];
  
  todayPlays.forEach(songKey => {
    // その日の最終記録
    const todayFinal = scoredatalogDb.prepare(\`
      SELECT clear, minbp, combo, 
             (epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as totalNotes
      FROM scoredatalog 
      WHERE sha256 = ? AND mode = ? AND date >= ? AND date < ?
      ORDER BY date DESC LIMIT 1
    \`).get(songKey.sha256, songKey.mode, startOfDay, endOfDay);
    
    // 前日までのベスト記録
    const previousBest = scoredatalogDb.prepare(\`
      SELECT clear, minbp, combo
      FROM scoredatalog 
      WHERE sha256 = ? AND mode = ? AND date < ?
      ORDER BY clear DESC, minbp ASC, combo DESC, date DESC
      LIMIT 1
    \`).get(songKey.sha256, songKey.mode, startOfDay);
    
    // 差分計算
    const updates = [];
    if (previousBest) {
      if (todayFinal.clear > previousBest.clear) {
        updates.push({ type: 'clear', old: previousBest.clear, new: todayFinal.clear });
      }
      if (todayFinal.minbp < previousBest.minbp) {
        updates.push({ type: 'minbp', old: previousBest.minbp, new: todayFinal.minbp });
      }
      // スコア計算は複雑なので別途実装
    }
    
    results.push({
      sha256: songKey.sha256,
      mode: songKey.mode,
      totalNotes: todayFinal.totalNotes,
      clear: todayFinal.clear,
      minbp: todayFinal.minbp,
      updates: updates
    });
  });
  
  return results;
}
`);

scoredatalogDb.close();
songdataDb.close();
