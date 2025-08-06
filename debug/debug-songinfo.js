const Database = require('better-sqlite3');
const db = new Database('./sample-db/songinfo.db', { readonly: true });

console.log('=== songinfo.db構造確認 ===');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));

// テーブル構造を確認
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(table => {
  console.log(`\n${table.name} テーブルの構造:`);
  const columns = db.pragma(`table_info(${table.name})`);
  columns.forEach(col => {
    console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
  });
  
  // サンプルデータを表示（最初の3件）
  try {
    const samples = db.prepare(`SELECT * FROM ${table.name} LIMIT 3`).all();
    console.log(`\nサンプルデータ（最初の3件）:`);
    samples.forEach((row, i) => {
      console.log(`  ${i+1}. ${JSON.stringify(row)}`);
    });
    
    // 総件数
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
    console.log(`\n総レコード数: ${count}件`);
  } catch (e) {
    console.log(`  データ取得エラー: ${e.message}`);
  }
});

db.close();
