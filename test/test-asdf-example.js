const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

// A.S.D.F [EX]のようなテストケースでベストスコア差分を検証
function testScoreDifference() {
  console.log('=== A.S.D.F [EX]型 ベストスコア差分テスト ===');
  
  // テストケース: A.S.D.F [EX]
  const testCases = [
    {
      songName: 'A.S.D.F [EX]',
      data: [
        { date: '2025-08-03', scores: [1980, 2012, 1995] },  // 8/3のプレイ（ベスト: 2012）
        { date: '2025-08-04', scores: [2025, 2052, 2040] }   // 8/4のプレイ（ベスト: 2052）
      ]
    },
    {
      songName: 'Test Song [HARD]',
      data: [
        { date: '2025-08-03', scores: [3200, 3180, 3250] },  // 8/3のプレイ（ベスト: 3250）
        { date: '2025-08-04', scores: [3270, 3245, 3280] }   // 8/4のプレイ（ベスト: 3280）
      ]
    }
  ];
  
  testCases.forEach((testCase, index) => {
    console.log(`\\n--- テストケース ${index + 1}: ${testCase.songName} ---`);
    
    // 前日までのベストスコア（8/3まで）
    const previousDayData = testCase.data[0];
    const previousBestScore = Math.max(...previousDayData.scores);
    
    // 当日のベストスコア（8/4）
    const currentDayData = testCase.data[1];
    const currentBestScore = Math.max(...currentDayData.scores);
    
    // 差分計算
    const scoreDifference = currentBestScore - previousBestScore;
    
    console.log(`${previousDayData.date}までのベストスコア: ${previousBestScore}`);
    console.log(`  プレイ履歴: ${previousDayData.scores.join(', ')}`);
    console.log(`${currentDayData.date}のベストスコア: ${currentBestScore}`);
    console.log(`  プレイ履歴: ${currentDayData.scores.join(', ')}`);
    console.log(`差分: ${scoreDifference > 0 ? '+' : ''}${scoreDifference}`);
    
    if (scoreDifference > 0) {
      console.log(`★ 改善あり: +${scoreDifference}点向上`);
    } else if (scoreDifference < 0) {
      console.log(`▼ スコア下降: ${scoreDifference}点`);
    } else {
      console.log(`= 変化なし`);
    }
    
    // main.jsの calculateDailyBestUpdates ロジックをシミュレート
    console.log(`\\n[main.js ロジック適用結果]`);
    if (scoreDifference > 0) {
      console.log(`updates.push({`);
      console.log(`  type: 'daily_score',`);
      console.log(`  old: ${previousBestScore},`);
      console.log(`  new: ${currentBestScore},`);
      console.log(`  improvement: ${scoreDifference}`);
      console.log(`});`);
    } else {
      console.log(`改善なしのため、更新データには含まれません`);
    }
  });
  
  console.log(`\\n=== 実際のscoredatalogデータでの確認 ===`);
  
  const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
  const db = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  
  // 実際のデータから似たようなケースを探す
  db.all(`
    SELECT sha256, 
           COUNT(*) as play_count,
           MIN((epg + lpg) * 2 + (egr + lgr) * 1) as min_score,
           MAX((epg + lpg) * 2 + (egr + lgr) * 1) as max_score,
           AVG((epg + lpg) * 2 + (egr + lgr) * 1) as avg_score
    FROM scoredatalog 
    WHERE date >= ?
    GROUP BY sha256 
    HAVING play_count > 1
    ORDER BY (max_score - min_score) DESC
    LIMIT 3
  `, [dayjs('2025-08-04').startOf('day').unix()], (err, realCases) => {
    if (err) {
      console.error('実データ検索エラー:', err);
      return;
    }
    
    if (realCases.length === 0) {
      console.log('同日に複数回プレイされた楽曲がありません');
    } else {
      console.log(`同日に複数回プレイされた楽曲 (スコア幅順):`);
      realCases.forEach((song, index) => {
        const scoreRange = song.max_score - song.min_score;
        console.log(`${index + 1}. ${song.sha256.substring(0, 8)}... `);
        console.log(`   ${song.play_count}回プレイ, スコア幅: ${scoreRange} (${song.min_score}～${song.max_score})`);
      });
    }
    
    db.close();
  });
}

// EXScoreの計算方法を確認
function verifyEXScoreCalculation() {
  console.log(`\\n=== EXScore計算方法の確認 ===`);
  console.log(`EXScore = (EPG + LPG) × 2 + (EGR + LGR) × 1`);
  console.log(`例:`);
  console.log(`  EPG: 800, LPG: 200, EGR: 150, LGR: 50`);
  console.log(`  EXScore = (800 + 200) × 2 + (150 + 50) × 1`);
  console.log(`  EXScore = 1000 × 2 + 200 × 1`);
  console.log(`  EXScore = 2000 + 200 = 2200`);
  
  // A.S.D.F [EX]の例でのEXScore逆算
  console.log(`\\nA.S.D.F [EX]の例での逆算:`);
  console.log(`  8/3までのベスト: 2012`);
  console.log(`  8/4のスコア: 2052`);
  console.log(`  差分: +40`);
  console.log(`\\n  可能な判定改善例:`);
  console.log(`  - EGR/LGR が40個増加 (×1)`);
  console.log(`  - EPG/LPG が20個増加 (×2)`);
  console.log(`  - 組み合わせ: EPG+10, EGR+20 → +10×2+20×1 = +40`);
}

// テスト実行
testScoreDifference();
verifyEXScoreCalculation();
