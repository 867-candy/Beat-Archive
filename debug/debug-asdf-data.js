const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// A.S.D.F [EX]のデータベース内容を詳細確認
function checkASDFData() {
  console.log('=== A.S.D.F [EX] データベース詳細確認 ===');
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  // A.S.D.F [EX]のsha256を特定
  db.all(`
    SELECT DISTINCT sha256, 
           COUNT(*) as total_plays,
           MIN(date) as first_play_unix,
           MAX(date) as last_play_unix
    FROM scoredatalog 
    GROUP BY sha256
    ORDER BY total_plays DESC
  `, [], (err, allSongs) => {
    if (err) {
      console.error('楽曲一覧取得エラー:', err);
      return;
    }
    
    console.log(`\n総楽曲数: ${allSongs.length}`);
    console.log('プレイ回数上位楽曲:');
    allSongs.slice(0, 10).forEach((song, index) => {
      const firstDate = dayjs.unix(song.first_play_unix).format('YYYY-MM-DD');
      const lastDate = dayjs.unix(song.last_play_unix).format('YYYY-MM-DD');
      console.log(`${index + 1}. ${song.sha256.substring(0, 12)}... (${song.total_plays}回) ${firstDate}～${lastDate}`);
    });
    
    // A.S.D.F [EX]と思われる楽曲を特定（複数プレイがある楽曲から推測）
    console.log('\n=== 8/3と8/4にプレイされた楽曲を検索 ===');
    
    const aug3Start = dayjs('2025-08-03').startOf('day').unix();
    const aug3End = dayjs('2025-08-03').endOf('day').unix();
    const aug4Start = dayjs('2025-08-04').startOf('day').unix();
    const aug4End = dayjs('2025-08-04').endOf('day').unix();
    
    db.all(`
      SELECT sha256
      FROM scoredatalog 
      WHERE date >= ? AND date <= ?
      GROUP BY sha256
      HAVING COUNT(*) >= 1
    `, [aug3Start, aug3End], (err, aug3Songs) => {
      if (err) {
        console.error('8/3楽曲検索エラー:', err);
        return;
      }
      
      db.all(`
        SELECT sha256
        FROM scoredatalog 
        WHERE date >= ? AND date <= ?
        GROUP BY sha256
        HAVING COUNT(*) >= 1
      `, [aug4Start, aug4End], (err, aug4Songs) => {
        if (err) {
          console.error('8/4楽曲検索エラー:', err);
          return;
        }
        
        // 両日でプレイされた楽曲を特定
        const aug3Hashes = new Set(aug3Songs.map(s => s.sha256));
        const bothDaysSongs = aug4Songs.filter(s => aug3Hashes.has(s.sha256));
        
        console.log(`8/3にプレイされた楽曲: ${aug3Songs.length}曲`);
        console.log(`8/4にプレイされた楽曲: ${aug4Songs.length}曲`);
        console.log(`両日でプレイされた楽曲: ${bothDaysSongs.length}曲`);
        
        if (bothDaysSongs.length > 0) {
          console.log('\n=== 両日でプレイされた楽曲の詳細 ===');
          
          bothDaysSongs.forEach((song, index) => {
            console.log(`\n--- 楽曲 ${index + 1}: ${song.sha256.substring(0, 12)}... ---`);
            
            // この楽曲の全プレイ履歴を取得
            db.all(`
              SELECT date, 
                     (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
                     epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, minbp, clear
              FROM scoredatalog 
              WHERE sha256 = ?
              ORDER BY date ASC
            `, [song.sha256], (err, plays) => {
              if (err) {
                console.error('プレイ履歴取得エラー:', err);
                return;
              }
              
              let aug3Plays = [];
              let aug4Plays = [];
              
              plays.forEach(play => {
                const playDate = dayjs.unix(play.date);
                const dateStr = playDate.format('YYYY-MM-DD HH:mm:ss');
                const playInfo = {
                  ...play,
                  dateStr: dateStr
                };
                
                if (play.date >= aug3Start && play.date <= aug3End) {
                  aug3Plays.push(playInfo);
                } else if (play.date >= aug4Start && play.date <= aug4End) {
                  aug4Plays.push(playInfo);
                }
              });
              
              console.log(`全プレイ履歴: ${plays.length}回`);
              
              if (aug3Plays.length > 0) {
                console.log(`\n8/3のプレイ (${aug3Plays.length}回):`);
                let aug3Best = 0;
                aug3Plays.forEach((play, i) => {
                  console.log(`  ${i + 1}. ${play.dateStr} - EXScore: ${play.exscore}`);
                  console.log(`     判定: EPG:${play.epg} LPG:${play.lpg} EGR:${play.egr} LGR:${play.lgr}`);
                  if (play.exscore > aug3Best) aug3Best = play.exscore;
                });
                console.log(`  8/3ベストスコア: ${aug3Best}`);
              }
              
              if (aug4Plays.length > 0) {
                console.log(`\n8/4のプレイ (${aug4Plays.length}回):`);
                let aug4Best = 0;
                aug4Plays.forEach((play, i) => {
                  console.log(`  ${i + 1}. ${play.dateStr} - EXScore: ${play.exscore}`);
                  console.log(`     判定: EPG:${play.epg} LPG:${play.lpg} EGR:${play.egr} LGR:${play.lgr}`);
                  if (play.exscore > aug4Best) aug4Best = play.exscore;
                });
                console.log(`  8/4ベストスコア: ${aug4Best}`);
                
                if (aug3Plays.length > 0) {
                  const aug3Best = Math.max(...aug3Plays.map(p => p.exscore));
                  const difference = aug4Best - aug3Best;
                  console.log(`\n★ 差分計算: ${aug4Best} - ${aug3Best} = ${difference > 0 ? '+' : ''}${difference}`);
                  
                  if (aug3Best === 2012 && aug4Best === 2052) {
                    console.log('🎯 これがA.S.D.F [EX]と思われます！');
                  }
                }
              }
              
              // main.jsのSQL条件をシミュレート
              console.log(`\n--- main.jsのSQL条件シミュレート ---`);
              const targetDateStart = dayjs('2025-08-04').startOf('day').unix();
              console.log(`targetDateStart (8/4 00:00:00): ${targetDateStart}`);
              
              // 前日以前のデータ (date < targetDateStart)
              const previousData = plays.filter(p => p.date < targetDateStart);
              console.log(`前日以前のプレイ数: ${previousData.length}`);
              
              if (previousData.length > 0) {
                const previousBest = Math.max(...previousData.map(p => p.exscore));
                console.log(`前日以前のベストスコア: ${previousBest}`);
                
                // 当日のデータ
                const currentData = plays.filter(p => p.date >= targetDateStart);
                if (currentData.length > 0) {
                  const currentBest = Math.max(...currentData.map(p => p.exscore));
                  console.log(`当日のベストスコア: ${currentBest}`);
                  console.log(`main.js計算結果: ${currentBest - previousBest > 0 ? '+' : ''}${currentBest - previousBest}`);
                }
              } else {
                console.log('❌ 前日以前のデータなし → daily_first_playと判定される');
              }
            });
          });
        }
        
        db.close();
      });
    });
  });
}

// 実行
checkASDFData();
