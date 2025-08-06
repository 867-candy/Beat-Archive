const Database = require('better-sqlite3');

console.log('===== データベース比較確認 =====');

// 1. scorelogテーブル確認
console.log('\n1. scorelogテーブル (プレイログ取得元)');
const scorelogDB = new Database('./sample-db/scorelog.db');
const scorelogData = scorelogDB.prepare(`
  SELECT * FROM scorelog 
  WHERE date BETWEEN ? AND ? 
  ORDER BY date
`).all(1722682800, 1722769199); // 2025-08-04のUnixタイムスタンプ

console.log(`scorelogから2025-08-04のプレイログ数: ${scorelogData.length}件`);
const asdfInScorelog = scorelogData.filter(row => row.sha256.startsWith('3244a453'));
console.log(`A.S.D.F [EX] (3244a453...)のscoredatalog: ${asdfInScorelog.length}件`);
scorelogDB.close();

// 2. scoredatalogテーブル確認
console.log('\n2. scoredatalogテーブル (前日差分計算元)');
const scoredatalogDB = new Database('./sample-db/scoredatalog.db');

// A.S.D.F [EX]の全データ
const asdfAllData = scoredatalogDB.prepare(`
  SELECT * FROM scoredatalog 
  WHERE sha256 = ? 
  ORDER BY date
`).all('3244a453abcdef1234567890abcdef1234567890abcdef1234567890abcdef12');

console.log(`A.S.D.F [EX]のscoredatalog全エントリ数: ${asdfAllData.length}件`);
asdfAllData.forEach((row, index) => {
  const score = (row.epg + row.lpg) * 2 + (row.egr + row.lgr) * 1;
  console.log(`${index + 1}. 日付: ${row.date}, スコア: ${score}, MISS: ${row.miss}, クリア: ${row.clear}`);
});

// 前日以前のデータ確認（main.jsのロジックと同じ）
console.log('\n3. 前日以前のデータ確認 (main.jsロジック再現)');
const start = '2025-08-04';
const beforeData = scoredatalogDB.prepare(`
  SELECT * FROM scoredatalog 
  WHERE sha256 = ? AND date < ? 
  ORDER BY date
`).all('3244a453abcdef1234567890abcdef1234567890abcdef1234567890abcdef12', start);

console.log(`前日以前 (< ${start}) のデータ数: ${beforeData.length}件`);
beforeData.forEach((row, index) => {
  const score = (row.epg + row.lpg) * 2 + (row.egr + row.lgr) * 1;
  console.log(`${index + 1}. 日付: ${row.date}, スコア: ${score}, MISS: ${row.miss}, クリア: ${row.clear}`);
});

// 当日のデータ確認
console.log('\n4. 当日のデータ確認');
const todayData = scoredatalogDB.prepare(`
  SELECT * FROM scoredatalog 
  WHERE sha256 = ? AND date = ? 
  ORDER BY date
`).all('3244a453abcdef1234567890abcdef1234567890abcdef1234567890abcdef12', start);

console.log(`当日 (= ${start}) のデータ数: ${todayData.length}件`);
todayData.forEach((row, index) => {
  const score = (row.epg + row.lpg) * 2 + (row.egr + row.lgr) * 1;
  console.log(`${index + 1}. 日付: ${row.date}, スコア: ${score}, MISS: ${row.miss}, クリア: ${row.clear}`);
});

scoredatalogDB.close();

// 3. score.dbテーブル確認
console.log('\n5. score.dbテーブル (現在のベストスコア元)');
const scoreDB = new Database('./sample-db/score.db');
const asdfScoreData = scoreDB.prepare(`
  SELECT * FROM score 
  WHERE sha256 = ?
`).get('3244a453abcdef1234567890abcdef1234567890abcdef1234567890abcdef12');

if (asdfScoreData) {
  console.log('A.S.D.F [EX]のscore.dbエントリ:');
  console.log(`  スコア: ${asdfScoreData.score || 'なし'}`);
  console.log(`  MISS: ${asdfScoreData.minbp || 'なし'}`);
  console.log(`  クリア: ${asdfScoreData.clear || 'なし'}`);
} else {
  console.log('A.S.D.F [EX]のscore.dbエントリ: 見つからない');
}
scoreDB.close();

console.log('\n===== 結論 =====');
console.log('main.jsは以下の順序で動作:');
console.log('1. scorelogからプレイログを取得');
console.log('2. 各楽曲について、scoredatalogで前日差分を計算');
console.log('3. score.dbから現在のベストスコアを取得');
console.log('4. 結果を統合して表示');
