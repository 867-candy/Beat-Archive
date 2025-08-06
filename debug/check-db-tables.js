const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sampleDbPath = path.join(__dirname, '..', 'sample-db', 'score.db');

console.log('Checking sample database tables...');
console.log('Database path:', sampleDbPath);

const db = new sqlite3.Database(sampleDbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Database opened successfully');
});

// テーブル一覧を取得
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error('Error querying tables:', err);
    return;
  }
  
  console.log('\nTables in database:');
  rows.forEach(row => {
    console.log('- ' + row.name);
  });
  
  // 各テーブルの構造を確認
  if (rows.length > 0) {
    console.log('\nTable structures:');
    let count = 0;
    const total = rows.length;
    
    rows.forEach(row => {
      db.all(`PRAGMA table_info(${row.name})`, (err, columns) => {
        if (err) {
          console.error(`Error getting table info for ${row.name}:`, err);
        } else {
          console.log(`\n${row.name} table structure:`);
          columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}`);
          });
        }
        
        count++;
        if (count === total) {
          db.close();
        }
      });
    });
  } else {
    console.log('No tables found');
    db.close();
  }
});
