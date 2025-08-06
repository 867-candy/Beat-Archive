const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// 実際に複数回プレイされた楽曲を使ってテスト
function findRealMultiPlaySongs() {
  console.log('=== 実際に複数回プレイされた楽曲でのテスト ===');
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  // 複数回プレイされた楽曲を検索
  db.all(`
    SELECT sha256, 
           COUNT(*) as play_count,
           MIN((epg + lpg) * 2 + (egr + lgr) * 1) as min_score,
           MAX((epg + lpg) * 2 + (egr + lgr) * 1) as max_score,
           MIN(date) as first_play,
           MAX(date) as last_play
    FROM scoredatalog 
    GROUP BY sha256
    HAVING play_count >= 2
    ORDER BY play_count DESC, (max_score - min_score) DESC
    LIMIT 10
  `, [], (err, multiPlaySongs) => {
    if (err) {
      console.error('複数プレイ楽曲検索エラー:', err);
      return;
    }
    
    console.log(`複数回プレイされた楽曲: ${multiPlaySongs.length}曲`);
    
    if (multiPlaySongs.length === 0) {
      console.log('❌ 複数回プレイされた楽曲が見つかりませんでした');
      console.log('\n=== A.S.D.F [EX]テストデータの作成が必要 ===');
      console.log('対処法:');
      console.log('1. テスト用のデータベースエントリを手動作成');
      console.log('2. 既存の楽曲を複数回プレイしてテストデータを生成');
      console.log('3. main.jsの論理を別のアプローチで検証');
      
      db.close();
      return;
    }
    
    console.log('\n=== 複数プレイ楽曲の詳細 ===');
    
    multiPlaySongs.forEach((song, index) => {
      console.log(`\n--- 楽曲${index + 1}: ${song.sha256.substring(0, 12)}... ---`);
      console.log(`プレイ回数: ${song.play_count}回`);
      console.log(`スコア範囲: ${song.min_score} ～ ${song.max_score} (差分: ${song.max_score - song.min_score})`);
      console.log(`期間: ${dayjs.unix(song.first_play).format('YYYY-MM-DD')} ～ ${dayjs.unix(song.last_play).format('YYYY-MM-DD')}`);
      
      // この楽曲の詳細なプレイ履歴を取得
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
        
        console.log(`\n${song.sha256.substring(0, 12)}...の全プレイ履歴:`);
        plays.forEach((play, i) => {
          const playDate = dayjs.unix(play.date).format('YYYY-MM-DD HH:mm');
          console.log(`  ${i + 1}. ${playDate} - EXScore: ${play.exscore}`);
        });
        
        // main.jsの処理をシミュレート（最後のプレイを基準に）
        if (plays.length >= 2) {
          const lastPlay = plays[plays.length - 1];
          const targetDateStart = dayjs.unix(lastPlay.date).startOf('day').unix();
          
          console.log(`\n--- main.js処理シミュレート (最後のプレイ: ${dayjs.unix(lastPlay.date).format('YYYY-MM-DD')}) ---`);
          
          // 前日以前のデータ
          const previousPlays = plays.filter(p => p.date < targetDateStart);
          console.log(`前日以前のプレイ数: ${previousPlays.length}`);
          
          if (previousPlays.length > 0) {
            const previousBest = Math.max(...previousPlays.map(p => p.exscore));
            console.log(`前日以前のベストスコア: ${previousBest}`);
            
            // 当日のデータ
            const currentDayPlays = plays.filter(p => p.date >= targetDateStart);
            if (currentDayPlays.length > 0) {
              const currentBest = Math.max(...currentDayPlays.map(p => p.exscore));
              console.log(`当日のベストスコア: ${currentBest}`);
              
              const difference = currentBest - previousBest;
              console.log(`計算される差分: ${difference > 0 ? '+' : ''}${difference}`);
              
              if (difference > 0) {
                console.log(`✅ daily_score improvement として表示される`);
              } else {
                console.log(`❌ 改善なしのため表示されない`);
              }
            }
          } else {
            console.log(`❌ 前日以前データなし → daily_first_play として処理される`);
            console.log(`表示されるスコア: +${lastPlay.exscore} (初回プレイ)`);
          }
        }
        
        if (index === 0) {
          console.log(`\n🎯 この楽曲 (${song.sha256.substring(0, 12)}...) をA.S.D.F [EX]の代替として使用できます`);
          
          // 最適なテスト日を提案
          if (plays.length >= 2) {
            const secondLastPlay = plays[plays.length - 2];
            const lastPlay = plays[plays.length - 1];
            
            const suggestedDate = dayjs.unix(lastPlay.date).format('YYYY-MM-DD');
            console.log(`推奨テスト日: ${suggestedDate}`);
            console.log(`期待される動作:`);
            console.log(`  - 前日までのベスト: ${Math.max(...plays.slice(0, -1).map(p => p.exscore))}`);
            console.log(`  - 当日のベスト: ${lastPlay.exscore}`);
            console.log(`  - 差分: ${lastPlay.exscore - Math.max(...plays.slice(0, -1).map(p => p.exscore))}`);
          }
        }
      });
    });
    
    setTimeout(() => {
      db.close();
    }, 2000);
  });
}

// 実行
findRealMultiPlaySongs();
