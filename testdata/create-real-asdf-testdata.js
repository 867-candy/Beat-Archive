const Database = require('better-sqlite3');

console.log('=== A.S.D.F [EX]正しいSHA256でテストデータ作成 ===');

// 実際のA.S.D.F [EX]のSHA256
const sha256 = '3244a453f9f6018e12bf13e30181c5c58ff9942d0690a2c626557442c7295eaa';

console.log(`正しいSHA256: ${sha256}`);

const db = new Database('./sample-db/scoredatalog.db');

// 既存のA.S.D.F [EX]データをクリア
console.log('既存データをクリア中...');
const deleteStmt = db.prepare('DELETE FROM scoredatalog WHERE sha256 = ?');
const deletedCount = deleteStmt.run(sha256).changes;
console.log(`削除されたレコード数: ${deletedCount}`);

// 新しいテストデータを作成
console.log('新しいテストデータを作成中...');

const insertStmt = db.prepare(`
  INSERT INTO scoredatalog (
    sha256, date, epg, lpg, egr, lgr, egd, lgd, ebd, lbd, 
    epr, lpr, ems, lms, miss, clear
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// テストデータ: 2012 → 2052 (+40) のパターン
const testData = [
  // 8/3のデータ（ベスト: 2012）
  { date: '2025-08-03 10:00:00', epg: 950, lpg: 56, egr: 45, lgr: 5, score: 1982 },
  { date: '2025-08-03 15:30:00', epg: 980, lpg: 26, egr: 20, lgr: 6, score: 2012 }, // ベスト
  { date: '2025-08-03 18:45:00', epg: 940, lpg: 66, egr: 45, lgr: 15, score: 1982 },
  
  // 8/4のデータ（ベスト: 2052）
  { date: '2025-08-04 09:15:00', epg: 960, lpg: 50, egr: 35, lgr: 15, score: 2020 },
  { date: '2025-08-04 14:20:00', epg: 990, lpg: 36, egr: 15, lgr: 1, score: 2052 }, // ベスト
  { date: '2025-08-04 19:10:00', epg: 965, lpg: 45, egr: 40, lgr: 10, score: 2020 }
];

console.log('挿入データ:');
testData.forEach((data, index) => {
  const calculatedScore = (data.epg + data.lpg) * 2 + (data.egr + data.lgr) * 1;
  console.log(`${index + 1}. ${data.date} - 計算スコア: ${calculatedScore} (期待: ${data.score})`);
  
  insertStmt.run(
    sha256,
    data.date,
    data.epg,   // EPG
    data.lpg,   // LPG  
    data.egr,   // EGR
    data.lgr,   // LGR
    0,          // EGD
    0,          // LGD
    0,          // EBD
    0,          // LBD
    0,          // EPR
    0,          // LPR
    0,          // EMS
    0,          // LMS
    89,         // MISS
    4           // CLEAR
  );
});

console.log('✅ テストデータ挿入完了');

// 挿入されたデータを確認
console.log('\n=== 挿入確認 ===');
const allData = db.prepare('SELECT * FROM scoredatalog WHERE sha256 = ? ORDER BY date').all(sha256);
console.log(`挿入されたA.S.D.F [EX]のデータ (${allData.length}件):`);

let bestBefore = 0;
let bestAfter = 0;

allData.forEach((row, index) => {
  const score = (row.epg + row.lpg) * 2 + (row.egr + row.lgr) * 1;
  console.log(`${index + 1}. ${row.date} - EXScore: ${score}`);
  
  if (row.date.startsWith('2025-08-03')) {
    bestBefore = Math.max(bestBefore, score);
  } else if (row.date.startsWith('2025-08-04')) {
    bestAfter = Math.max(bestAfter, score);
  }
});

console.log('\n計算結果:');
console.log(`8/3までのベストスコア: ${bestBefore}`);
console.log(`8/4のベストスコア: ${bestAfter}`);
console.log(`期待される差分: ${bestAfter - bestBefore}`);

if (bestBefore === 2012 && bestAfter === 2052) {
  console.log('🎯 期待通りの2012→2052 (+40) が作成されました！');
} else {
  console.log('❌ 期待と異なるスコアになりました');
}

db.close();

console.log('\n次のステップ: Electronアプリを再起動して、A.S.D.F [EX]が正しく+40として表示されるかテストしてください。');
