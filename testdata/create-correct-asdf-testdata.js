const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// A.S.D.F [EX]のテストデータを正確な2012/2052で作成
function createCorrectASDFTestData() {
  console.log('=== A.S.D.F [EX]正確なテストデータの作成 (2012/2052) ===');
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath);
  
  // A.S.D.F [EX]用のテストSHA256ハッシュ
  const asdfSha256 = 'ASDF1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
  
  // EXScore 2012 を作るための判定: (EPG + LPG) * 2 + (EGR + LGR) * 1 = 2012
  // 例: EPG:800, LPG:200, EGR:150, LGR:62 = (800+200)*2 + (150+62)*1 = 2000 + 212 = 2212 (多すぎ)
  // 例: EPG:700, LPG:300, EGR:100, LGR:12 = (700+300)*2 + (100+12)*1 = 2000 + 112 = 2112 (多すぎ)
  // 例: EPG:600, LPG:400, EGR:100, LGR:12 = (600+400)*2 + (100+12)*1 = 2000 + 112 = 2112 (多すぎ)
  // 例: EPG:500, LPG:500, EGR:10, LGR:2 = (500+500)*2 + (10+2)*1 = 2000 + 12 = 2012 ✓
  
  // EXScore 2052 を作るための判定: +40の改善
  // 例: EPG:500, LPG:500, EGR:30, LGR:22 = (500+500)*2 + (30+22)*1 = 2000 + 52 = 2052 ✓
  
  // 8/3のプレイデータ (ベストスコア: 2012)
  const aug3Plays = [
    {
      date: dayjs('2025-08-03 10:00:00').unix(),
      epg: 480, lpg: 490, egr: 20, lgr: 22, // EXScore = (480+490)*2 + (20+22)*1 = 1940 + 42 = 1982
      egd: 80, lgd: 70, ebd: 30, lbd: 20,
      epr: 10, lpr: 8, ems: 5, lms: 3, minbp: 120, clear: 6
    },
    {
      date: dayjs('2025-08-03 15:30:00').unix(),
      epg: 500, lpg: 500, egr: 10, lgr: 2, // EXScore = (500+500)*2 + (10+2)*1 = 2000 + 12 = 2012 ✓
      egd: 60, lgd: 50, ebd: 25, lbd: 15,
      epr: 8, lpr: 6, ems: 3, lms: 2, minbp: 100, clear: 7
    },
    {
      date: dayjs('2025-08-03 18:45:00').unix(),
      epg: 490, lpg: 480, egr: 25, lgr: 17, // EXScore = (490+480)*2 + (25+17)*1 = 1940 + 42 = 1982
      egd: 70, lgd: 60, ebd: 28, lbd: 18,
      epr: 9, lpr: 7, ems: 4, lms: 2, minbp: 110, clear: 6
    }
  ];
  
  // 8/4のプレイデータ (ベストスコア: 2052)
  const aug4Plays = [
    {
      date: dayjs('2025-08-04 09:15:00').unix(),
      epg: 495, lpg: 485, egr: 35, lgr: 25, // EXScore = (495+485)*2 + (35+25)*1 = 1960 + 60 = 2020
      egd: 65, lgd: 55, ebd: 22, lbd: 12,
      epr: 7, lpr: 5, ems: 2, lms: 1, minbp: 95, clear: 7
    },
    {
      date: dayjs('2025-08-04 14:20:00').unix(),
      epg: 500, lpg: 500, egr: 30, lgr: 22, // EXScore = (500+500)*2 + (30+22)*1 = 2000 + 52 = 2052 ✓
      egd: 50, lgd: 40, ebd: 20, lbd: 10,
      epr: 5, lpr: 3, ems: 1, lms: 1, minbp: 85, clear: 7
    },
    {
      date: dayjs('2025-08-04 19:10:00').unix(),
      epg: 485, lpg: 495, egr: 40, lgr: 20, // EXScore = (485+495)*2 + (40+20)*1 = 1960 + 60 = 2020
      egd: 60, lgd: 50, ebd: 24, lbd: 14,
      epr: 8, lpr: 6, ems: 3, lms: 2, minbp: 90, clear: 7
    }
  ];
  
  console.log('正確なA.S.D.F [EX]テストデータを挿入中...');
  console.log(`SHA256: ${asdfSha256}`);
  
  // まず既存のテストデータを削除
  db.run('DELETE FROM scoredatalog WHERE sha256 = ?', [asdfSha256], (err) => {
    if (err) {
      console.error('既存データ削除エラー:', err);
      return;
    }
    
    // 新しいデータを挿入
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
          console.log('\n=== 正確なテストデータ挿入完了 ===');
          
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
            
            if (aug3Best === 2012 && aug4Best === 2052) {
              console.log(`🎯 期待通りの2012→2052 (+40) が作成されました！`);
            } else {
              console.log(`⚠️  期待値と異なります。調整が必要です。`);
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
              
              if (difference === 40) {
                console.log(`✅ 期待通りの+40差分！ daily_score として処理される予定`);
              } else {
                console.log(`❌ 期待値(+40)と異なる差分: ${difference}`);
              }
            }
            
            db.close();
            
            console.log(`\n次のステップ: Electronアプリを再起動して、A.S.D.F [EX]が正しく+40として表示されるかテストしてください。`);
          });
        }
      });
    });
  });
}

// 実行
createCorrectASDFTestData();
