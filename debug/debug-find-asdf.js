const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// A.S.D.F [EX]と思われる楽曲を特定
function findASDFCandidate() {
  console.log('=== A.S.D.F [EX]候補楽曲の検索 ===');
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  // スコア2012と2052に近いデータを検索
  console.log('スコア2012付近（±50）の楽曲を検索中...');
  
  db.all(`
    SELECT sha256, date, 
           (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
           epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, minbp, clear
    FROM scoredatalog 
    WHERE (epg + lpg) * 2 + (egr + lgr) * 1 >= 1962 
      AND (epg + lpg) * 2 + (egr + lgr) * 1 <= 2102
    ORDER BY exscore ASC
  `, [], (err, score2012Area) => {
    if (err) {
      console.error('2012付近検索エラー:', err);
      return;
    }
    
    console.log(`スコア1962-2102の範囲で${score2012Area.length}件のプレイ記録が見つかりました`);
    
    // スコア2052付近も検索
    db.all(`
      SELECT sha256, date, 
             (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
             epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, minbp, clear
      FROM scoredatalog 
      WHERE (epg + lpg) * 2 + (egr + lgr) * 1 >= 2002 
        AND (epg + lpg) * 2 + (egr + lgr) * 1 <= 2102
      ORDER BY exscore ASC
    `, [], (err, score2052Area) => {
      if (err) {
        console.error('2052付近検索エラー:', err);
        return;
      }
      
      console.log(`スコア2002-2102の範囲で${score2052Area.length}件のプレイ記録が見つかりました`);
      
      // 同じsha256で2012と2052の両方に近いスコアがある楽曲を検索
      const score2012Hashes = new Set(score2012Area.map(s => s.sha256));
      const bothScoreSongs = score2052Area.filter(s => score2012Hashes.has(s.sha256));
      const uniqueHashes = [...new Set(bothScoreSongs.map(s => s.sha256))];
      
      console.log(`\n2012と2052付近の両方のスコアを持つ楽曲: ${uniqueHashes.length}曲`);
      
      if (uniqueHashes.length > 0) {
        console.log('\n=== A.S.D.F [EX]候補楽曲の詳細 ===');
        
        let candidateCount = 0;
        uniqueHashes.forEach((hash, index) => {
          if (candidateCount >= 5) return; // 上位5曲まで表示
          
          console.log(`\n--- 候補${index + 1}: ${hash.substring(0, 12)}... ---`);
          
          // この楽曲の全プレイ履歴を取得
          db.all(`
            SELECT date, 
                   (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
                   epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms, minbp, clear
            FROM scoredatalog 
            WHERE sha256 = ?
            ORDER BY date ASC
          `, [hash], (err, plays) => {
            if (err) {
              console.error('プレイ履歴取得エラー:', err);
              return;
            }
            
            console.log(`総プレイ回数: ${plays.length}回`);
            
            let hasScore2012 = false;
            let hasScore2052 = false;
            let score2012Date = null;
            let score2052Date = null;
            
            plays.forEach((play, i) => {
              const playDate = dayjs.unix(play.date).format('YYYY-MM-DD HH:mm');
              console.log(`  ${i + 1}. ${playDate} - EXScore: ${play.exscore}`);
              
              if (Math.abs(play.exscore - 2012) <= 5) {
                hasScore2012 = true;
                score2012Date = playDate;
                console.log(`    ★ 2012付近のスコア発見！`);
              }
              if (Math.abs(play.exscore - 2052) <= 5) {
                hasScore2052 = true;
                score2052Date = playDate;
                console.log(`    ★ 2052付近のスコア発見！`);
              }
            });
            
            if (hasScore2012 && hasScore2052) {
              console.log(`\n🎯 A.S.D.F [EX]の可能性が高い楽曲です！`);
              console.log(`   2012付近: ${score2012Date}`);
              console.log(`   2052付近: ${score2052Date}`);
              candidateCount++;
              
              // この楽曲でmain.jsの処理をシミュレート
              console.log(`\n--- main.js処理シミュレート ---`);
              
              // 各プレイが8/4として処理された場合をシミュレート
              plays.forEach((currentPlay, playIndex) => {
                const currentPlayDate = dayjs.unix(currentPlay.date);
                const targetDateStart = currentPlayDate.startOf('day').unix();
                
                console.log(`\nプレイ${playIndex + 1} (${currentPlayDate.format('YYYY-MM-DD HH:mm')})を8/4として処理する場合:`);
                
                // 前日以前のデータ
                const previousPlays = plays.filter(p => p.date < targetDateStart);
                console.log(`  前日以前のプレイ数: ${previousPlays.length}`);
                
                if (previousPlays.length > 0) {
                  const previousBest = Math.max(...previousPlays.map(p => p.exscore));
                  console.log(`  前日以前のベスト: ${previousBest}`);
                  
                  // 当日のベスト（現在のプレイまで）
                  const currentDayPlays = plays.filter(p => p.date >= targetDateStart && p.date <= currentPlay.date);
                  const currentBest = Math.max(...currentDayPlays.map(p => p.exscore));
                  console.log(`  当日のベスト: ${currentBest}`);
                  
                  const difference = currentBest - previousBest;
                  console.log(`  差分: ${difference > 0 ? '+' : ''}${difference}`);
                  
                  if (difference === 40) {
                    console.log(`  🎯 期待される+40の差分が見つかりました！`);
                  }
                } else {
                  console.log(`  ❌ 前日以前データなし → daily_first_play`);
                }
              });
            }
          });
        });
      } else {
        console.log('\n❌ 2012と2052付近の両方のスコアを持つ楽曲が見つかりませんでした');
        
        // より広い範囲で検索
        console.log('\n=== より広い範囲での検索 ===');
        db.all(`
          SELECT sha256, 
                 COUNT(*) as play_count,
                 MIN((epg + lpg) * 2 + (egr + lgr) * 1) as min_score,
                 MAX((epg + lpg) * 2 + (egr + lgr) * 1) as max_score
          FROM scoredatalog 
          WHERE (epg + lpg) * 2 + (egr + lgr) * 1 >= 1900 
            AND (epg + lpg) * 2 + (egr + lgr) * 1 <= 2200
          GROUP BY sha256
          HAVING play_count >= 2 AND (max_score - min_score) >= 30
          ORDER BY (max_score - min_score) DESC
          LIMIT 10
        `, [], (err, widerSearch) => {
          if (err) {
            console.error('広範囲検索エラー:', err);
            return;
          }
          
          console.log(`スコア範囲1900-2200で複数プレイ&30点以上の差がある楽曲: ${widerSearch.length}曲`);
          widerSearch.forEach((song, i) => {
            const scoreRange = song.max_score - song.min_score;
            console.log(`${i + 1}. ${song.sha256.substring(0, 12)}... (${song.play_count}回) スコア幅:${scoreRange} (${song.min_score}～${song.max_score})`);
          });
          
          db.close();
        });
      }
    });
  });
}

// 実行
findASDFCandidate();
