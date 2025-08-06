const Database = require('better-sqlite3');
const dayjs = require('dayjs');

console.log('===== scorelogテーブルにA.S.D.F [EX]データを追加 =====');

const scorelogDB = new Database('./sample-db/scorelog.db');

// A.S.D.F [EX]のSHA256
const sha256 = '3244a453abcdef1234567890abcdef1234567890abcdef1234567890abcdef12';

// 2025-08-04のUnixタイムスタンプ
const date_20250804 = dayjs('2025-08-04').unix();

console.log('追加するscorelogデータ:');
console.log(`SHA256: ${sha256}`);
console.log(`日付: 2025-08-04 (Unix: ${date_20250804})`);

// scorelogにデータを追加
try {
  scorelogDB.prepare(`
    INSERT OR REPLACE INTO scorelog (sha256, date)
    VALUES (?, ?)
  `).run(sha256, date_20250804);
  
  console.log('✅ scorelogにA.S.D.F [EX]のプレイログを追加しました');
  
  // 確認
  const result = scorelogDB.prepare(`
    SELECT * FROM scorelog 
    WHERE sha256 = ? AND date = ?
  `).get(sha256, date_20250804);
  
  if (result) {
    console.log('✅ 追加されたデータを確認:', result);
  } else {
    console.log('❌ データの追加に失敗しました');
  }
  
} catch (error) {
  console.error('❌ scorelogデータ追加エラー:', error);
}

scorelogDB.close();

console.log('\n===== 再確認：scorelogから2025-08-04のプレイログ取得 =====');
const scorelogDB2 = new Database('./sample-db/scorelog.db');
const scorelogData = scorelogDB2.prepare(`
  SELECT * FROM scorelog 
  WHERE date BETWEEN ? AND ? 
  ORDER BY date
`).all(1722682800, 1722769199);

console.log(`scorelogから2025-08-04のプレイログ数: ${scorelogData.length}件`);
const asdfInScorelog = scorelogData.filter(row => row.sha256.startsWith('3244a453'));
console.log(`A.S.D.F [EX] (3244a453...)のscorelog: ${asdfInScorelog.length}件`);

if (asdfInScorelog.length > 0) {
  asdfInScorelog.forEach((row, index) => {
    console.log(`${index + 1}. SHA256: ${row.sha256.substring(0, 8)}..., 日付: ${row.date}`);
  });
}

scorelogDB2.close();
