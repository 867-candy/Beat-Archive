const Database = require('better-sqlite3');
const songdataDb = new Database('./sample-db/songdata.db', { readonly: true });

console.log('=== songdata.db構造確認 ===');
console.log('Tables:', songdataDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));

// songdata テーブルの構造を確認
const tables = songdataDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(table => {
  console.log(`\n${table.name} テーブルの構造:`);
  const columns = songdataDb.pragma(`table_info(${table.name})`);
  columns.forEach(col => {
    console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
  });
  
  // サンプルデータを表示（最初の3件）
  try {
    const samples = songdataDb.prepare(`SELECT * FROM ${table.name} LIMIT 3`).all();
    console.log(`\nサンプルデータ（最初の3件）:`);
    samples.forEach((row, i) => {
      console.log(`  ${i+1}. ${JSON.stringify(row)}`);
    });
    
    // 総件数
    const count = songdataDb.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
    console.log(`\n総レコード数: ${count}件`);
  } catch (e) {
    console.log(`  データ取得エラー: ${e.message}`);
  }
});

songdataDb.close();

// scoredatalogのSHA256と照合してみる
console.log('\n=== SHA256の照合テスト ===');
const scoredatalogDb = new Database('./sample-db/scoredatalog.db', { readonly: true });
const songdataDb2 = new Database('./sample-db/songdata.db', { readonly: true });

// scoredatalogから最初のSHA256を取得
const scoredatalogSample = scoredatalogDb.prepare('SELECT sha256 FROM scoredatalog LIMIT 1').get();
console.log('scoredatalogのSHA256例:', scoredatalogSample?.sha256);

// songdataでSHA256フィールドがあるかチェック
try {
  const songdataSample = songdataDb2.prepare('SELECT * FROM song WHERE sha256 = ?').get(scoredatalogSample?.sha256);
  console.log('songdataで見つかった楽曲:', songdataSample);
} catch (e) {
  console.log('songdataにsha256フィールドが存在しない可能性:', e.message);
  
  // 代替手段: md5やfolder+fileでのマッチング可能性を調査
  const allColumns = songdataDb2.pragma('table_info(song)');
  console.log('songdataの全カラム:');
  allColumns.forEach(col => console.log(`  - ${col.name}`));
}

scoredatalogDb.close();
songdataDb2.close();
