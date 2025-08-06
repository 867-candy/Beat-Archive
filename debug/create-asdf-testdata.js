const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// A.S.D.F [EX]のテストデータを作成
function createASDFTestData() {
  console.log('=== A.S.D.F [EX]テストデータの作成 ===');
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath);
  
  // A.S.D.F [EX]用のテストSHA256ハッシュ
  const asdfSha256 = 'ASDF1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
  
  // 8/3のプレイデータ (ベストスコア: 2012)
  const aug3Plays = [
    {
      date: dayjs('2025-08-03 10:00:00').unix(),
      epg: 800, lpg: 200, egr: 150, lgr: 62, // EXScore = (800+200)*2 + (150+62)*1 = 2212
      egd: 50, lgd: 30, ebd: 20, lbd: 10,
      epr: 5, lpr: 3, ems: 2, lms: 1, minbp: 100, clear: 7
    },
    {
      date: dayjs('2025-08-03 15:30:00').unix(),
      epg: 820, lpg: 180, egr: 140, lgr: 72, // EXScore = (820+180)*2 + (140+72)*1 = 2212
      egd: 45, lgd: 35, ebd: 15, lbd: 12,
      epr: 4, lpr: 2, ems: 1, lms: 1, minbp: 95, clear: 7
    },
    {
      date: dayjs('2025-08-03 18:45:00').unix(),
      epg: 806, lpg: 200, egr: 100, lgr: 100, // EXScore = (806+200)*2 + (100+100)*1 = 2212
      egd: 40, lgd: 25, ebd: 18, lbd: 8,
      epr: 3, lpr: 2, ems: 1, lms: 0, minbp: 90, clear: 7
    }
  ];
  
  // 8/4のプレイデータ (ベストスコア: 2052)
  const aug4Plays = [
    {
      date: dayjs('2025-08-04 09:15:00').unix(),
      epg: 825, lpg: 185, egr: 135, lgr: 77, // EXScore = (825+185)*2 + (135+77)*1 = 2232
      egd: 42, lgd: 30, ebd: 16, lbd: 9,
      epr: 3, lpr: 1, ems: 1, lms: 0, minbp: 88, clear: 7
    },
    {
      date: dayjs('2025-08-04 14:20:00').unix(),
      epg: 826, lpg: 200, egr: 100, lgr: 100, // EXScore = (826+200)*2 + (100+100)*1 = 2252
      egd: 35, lgd: 28, ebd: 12, lbd: 6,
      epr: 2, lpr: 1, ems: 0, lms: 0, minbp: 85, clear: 7
    },
    {
      date: dayjs('2025-08-04 19:10:00').unix(),
      epg: 810, lpg: 190, egr: 130, lgr: 80, // EXScore = (810+190)*2 + (130+80)*1 = 2210
      egd: 38, lgd: 32, ebd: 14, lbd: 8,
      epr: 3, lpr: 2, ems: 1, lms: 0, minbp: 87, clear: 7
    }
  ];
  
  console.log('A.S.D.F [EX]のテストデータを挿入中...');
  console.log(`SHA256: ${asdfSha256}`);
  
  // まず既存のテストデータを削除
  db.run('DELETE FROM scoredatalog WHERE sha256 = ?', [asdfSha256], (err) => {
    if (err) {
      console.error('既存データ削除エラー:', err);
      return;
    }
    
    // 8/3のデータを挿入
    let insertCount = 0;
    const totalInserts = aug3Plays.length + aug4Plays.length;
    
    [...aug3Plays, ...aug4Plays].forEach((play, index) => {
      const sql = `
        INSERT INTO scoredatalog (
          sha256, date, epg, lpg, egr, lgr, egd, lgd, ebd, lbd, 
          epr, lpr, ems, lms, minbp, clear
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        asdfSha256, play.date, play.epg, play.lpg, play.egr, play.lgr,
        play.egd, play.lgd, play.ebd, play.lbd, play.epr, play.lpr,
        play.ems, play.lms, play.minbp, play.clear
      ], (err) => {
        if (err) {
          console.error(`データ挿入エラー (${index + 1}):`, err);
          return;
        }
        
        insertCount++;
        const exscore = (play.epg + play.lpg) * 2 + (play.egr + play.lgr) * 1;
        const dateStr = dayjs.unix(play.date).format('YYYY-MM-DD HH:mm:ss');
        console.log(`✅ ${insertCount}/${totalInserts}: ${dateStr} - EXScore: ${exscore}`);
        
        if (insertCount === totalInserts) {
          console.log('\n=== テストデータ挿入完了 ===');
          
          // 挿入されたデータを確認
          db.all(`
            SELECT date, 
                   (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
                   epg, lpg, egr, lgr
            FROM scoredatalog 
            WHERE sha256 = ?
            ORDER BY date ASC
          `, [asdfSha256], (err, insertedData) => {
            if (err) {
              console.error('確認クエリエラー:', err);
              return;
            }
            
            console.log(`\n挿入されたA.S.D.F [EX]のデータ (${insertedData.length}件):`);
            
            let aug3Best = 0;
            let aug4Best = 0;
            
            insertedData.forEach((play, i) => {
              const playDate = dayjs.unix(play.date);
              const dateStr = playDate.format('YYYY-MM-DD HH:mm:ss');
              console.log(`${i + 1}. ${dateStr} - EXScore: ${play.exscore}`);
              
              if (playDate.format('YYYY-MM-DD') === '2025-08-03') {
                aug3Best = Math.max(aug3Best, play.exscore);
              } else if (playDate.format('YYYY-MM-DD') === '2025-08-04') {
                aug4Best = Math.max(aug4Best, play.exscore);
              }
            });
            
            console.log(`\n計算結果:`);
            console.log(`8/3までのベストスコア: ${aug3Best}`);
            console.log(`8/4のベストスコア: ${aug4Best}`);
            console.log(`期待される差分: ${aug4Best - aug3Best}`);
            
            if (aug3Best === 2212 && aug4Best === 2252) {
              console.log(`🎯 期待通りの差分 +40 が計算できます！`);
            }
            
            // main.jsの処理をシミュレート
            console.log(`\n=== main.js処理シミュレート ===`);
            const targetDateStart = dayjs('2025-08-04').startOf('day').unix();
            
            const previousData = insertedData.filter(p => p.date < targetDateStart);
            const currentData = insertedData.filter(p => p.date >= targetDateStart);
            
            console.log(`前日以前のプレイ数: ${previousData.length}`);
            console.log(`当日のプレイ数: ${currentData.length}`);
            
            if (previousData.length > 0 && currentData.length > 0) {
              const previousBest = Math.max(...previousData.map(p => p.exscore));
              const currentBest = Math.max(...currentData.map(p => p.exscore));
              const difference = currentBest - previousBest;
              
              console.log(`前日以前ベスト: ${previousBest}`);
              console.log(`当日ベスト: ${currentBest}`);
              console.log(`差分: ${difference > 0 ? '+' : ''}${difference}`);
              
              if (difference > 0) {
                console.log(`✅ daily_score として処理される予定`);
              } else {
                console.log(`❌ 改善なしのため非表示`);
              }
            }
            
            db.close();
          });
        }
      });
    });
  });
}

// 実行
createASDFTestData();
