const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'local-data.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
    return;
  }
  console.log('local-data.dbに接続しました');
});

// 8/7のscorelogデータから楽曲情報を取得
const query = `
  SELECT 
    sl.sha256,
    sl.date,
    s.title,
    s.subtitle,
    s.artist
  FROM scorelog sl
  LEFT JOIN songdata s ON sl.sha256 = s.sha256
  WHERE sl.date = '2025-08-07'
  AND s.title LIKE '%空%'
  ORDER BY sl.date DESC
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('クエリエラー:', err.message);
    return;
  }
  
  console.log('\n=== 8/7の「空」を含む楽曲データ ===');
  console.log(`見つかった楽曲数: ${rows.length}`);
  
  rows.forEach((row, index) => {
    console.log(`\n楽曲 ${index + 1}:`);
    console.log(`  SHA256: ${row.sha256}`);
    console.log(`  title: "${row.title}"`);
    console.log(`  subtitle: "${row.subtitle}"`);
    console.log(`  artist: "${row.artist}"`);
    console.log(`  日付: ${row.date}`);
  });
  
  db.close();
});
