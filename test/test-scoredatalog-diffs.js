const Database = require('better-sqlite3');
const scoredatalogDb = new Database('./sample-db/scoredatalog.db', { readonly: true });
const songdataDb = new Database('./sample-db/songdata.db', { readonly: true });

console.log('=== scoredatalogベース差分計算テスト ===');

// 8/4の全プレイを取得
const targetDate = '2025-08-04';
const startOfDay = new Date(targetDate).getTime() / 1000;
const endOfDay = startOfDay + 24 * 60 * 60;

console.log(`対象日: ${targetDate} (${startOfDay} - ${endOfDay})`);

// 8/4の全プレイを取得
const targetDate = '2025-08-04';
const startOfDay = new Date(targetDate).getTime() / 1000;
const endOfDay = startOfDay + 24 * 60 * 60;

console.log(`対象日: ${targetDate} (${startOfDay} - ${endOfDay})`);

// scoredatalogの全期間データを確認
const allData = scoredatalogDb.prepare('SELECT COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date FROM scoredatalog').get();
console.log(`scoredatalog全データ: ${allData.count}件`);
console.log(`期間: ${new Date(allData.min_date * 1000).toLocaleDateString()} - ${new Date(allData.max_date * 1000).toLocaleDateString()}`);

// その日にプレイした楽曲のSHA256一覧を取得
const playedSongs = scoredatalogDb.prepare(`
  SELECT DISTINCT sha256, mode 
  FROM scoredatalog 
  WHERE date >= ? AND date < ?
`).all(startOfDay, endOfDay);

console.log(`その日プレイした楽曲数: ${playedSongs.length}件`);

// データが少ない場合は全期間から複数プレイのある楽曲を使ってテスト
if (playedSongs.length < 5) {
  console.log('\n=== 代替テスト: 複数プレイのある楽曲で差分計算テスト ===');
  
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
    
    // 差分計算のシミュレーション（最初と最後を比較）
    if (allPlays.length >= 2) {
      const firstPlay = allPlays[0];
      const lastPlay = allPlays[allPlays.length - 1];
      
      console.log(`初回プレイ: ${new Date(firstPlay.date * 1000).toLocaleDateString()} Clear:${firstPlay.clear} MISS:${firstPlay.minbp} Combo:${firstPlay.combo}`);
      console.log(`最終プレイ: ${new Date(lastPlay.date * 1000).toLocaleDateString()} Clear:${lastPlay.clear} MISS:${lastPlay.minbp} Combo:${lastPlay.combo}`);
      
      // 差分計算
      const clearImproved = lastPlay.clear > firstPlay.clear;
      const missImproved = lastPlay.minbp < firstPlay.minbp;
      const comboImproved = lastPlay.combo > firstPlay.combo;
      
      console.log('改善項目:');
      if (clearImproved) console.log(`  クリア: ${firstPlay.clear} → ${lastPlay.clear} (+${lastPlay.clear - firstPlay.clear})`);
      if (missImproved) console.log(`  MISS: ${firstPlay.minbp} → ${lastPlay.minbp} (${lastPlay.minbp - firstPlay.minbp})`);
      if (comboImproved) console.log(`  コンボ: ${firstPlay.combo} → ${lastPlay.combo} (+${lastPlay.combo - firstPlay.combo})`);
      
      if (!clearImproved && !missImproved && !comboImproved) {
        console.log('  改善なし');
      }
    }
  });
}

// 各楽曲について差分計算をテスト（最初の3曲）
playedSongs.slice(0, 3).forEach((songKey, index) => {
  console.log(`\n--- ${index + 1}. 楽曲 ${songKey.sha256.substring(0, 16)}... mode:${songKey.mode} ---`);
  
  // 楽曲情報を取得
  const songInfo = songdataDb.prepare('SELECT title, artist FROM song WHERE sha256 = ?').get(songKey.sha256);
  console.log(`楽曲名: ${songInfo?.title || 'Unknown'} / ${songInfo?.artist || 'Unknown'}`);
  
  // その日のプレイ記録（時系列順）
  const todayPlays = scoredatalogDb.prepare(`
    SELECT 
      clear, minbp, combo, date,
      (epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as totalNotes,
      (epg + lpg) as pgreat,
      (egr + lgr) as great,
      (egd + lgd) as good,
      (ebd + lbd) as bad,
      (epr + lpr) as poor,
      (ems + lms) as miss
    FROM scoredatalog 
    WHERE sha256 = ? AND mode = ? AND date >= ? AND date < ?
    ORDER BY date ASC
  `).all(songKey.sha256, songKey.mode, startOfDay, endOfDay);
  
  // その日より前のベスト記録
  const previousBest = scoredatalogDb.prepare(`
    SELECT 
      clear, minbp, combo, date,
      (epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as totalNotes,
      (epg + lpg) as pgreat,
      (egr + lgr) as great,
      (egd + lgd) as good,
      (ebd + lbd) as bad,
      (epr + lpr) as poor,
      (ems + lms) as miss
    FROM scoredatalog 
    WHERE sha256 = ? AND mode = ? AND date < ?
    ORDER BY 
      clear DESC,  -- クリア種類が高い順
      minbp ASC,   -- MISS数が少ない順
      combo DESC,  -- コンボが多い順
      date DESC    -- 最新順
    LIMIT 1
  `).get(songKey.sha256, songKey.mode, startOfDay);
  
  console.log(`その日のプレイ回数: ${todayPlays.length}回`);
  console.log(`前日までのベスト:`, previousBest ? 
    `Clear:${previousBest.clear} MISS:${previousBest.minbp} Combo:${previousBest.combo}` : 
    '記録なし');
  
  if (todayPlays.length > 0) {
    const latestPlay = todayPlays[todayPlays.length - 1]; // その日の最後のプレイ
    console.log(`その日の最終記録: Clear:${latestPlay.clear} MISS:${latestPlay.minbp} Combo:${latestPlay.combo}`);
    
    // 差分計算
    if (previousBest) {
      const clearImproved = latestPlay.clear > previousBest.clear;
      const missImproved = latestPlay.minbp < previousBest.minbp;
      const comboImproved = latestPlay.combo > previousBest.combo;
      
      console.log('改善項目:');
      if (clearImproved) console.log(`  クリア: ${previousBest.clear} → ${latestPlay.clear}`);
      if (missImproved) console.log(`  MISS: ${previousBest.minbp} → ${latestPlay.minbp} (${latestPlay.minbp - previousBest.minbp})`);
      if (comboImproved) console.log(`  コンボ: ${previousBest.combo} → ${latestPlay.combo} (+${latestPlay.combo - previousBest.combo})`);
      
      if (!clearImproved && !missImproved && !comboImproved) {
        console.log('  改善なし');
      }
    } else {
      console.log('  初回プレイ');
    }
  }
});

scoredatalogDb.close();
songdataDb.close();
