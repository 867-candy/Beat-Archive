const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = 'C:\\Users\\yuhi-dosei\\Downloads\\scorelog.db';

console.log('Checking user database...');
console.log('Database path:', dbPath);

const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.log('ERROR: Database file does not exist!');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
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
  
  // scoreテーブルが存在するかチェック
  const hasScoreTable = rows.some(row => row.name === 'score');
  console.log('\nHas score table:', hasScoreTable);
  
  if (hasScoreTable) {
    // scoreテーブルの構造を確認
    db.all(`PRAGMA table_info(score)`, (err, columns) => {
      if (err) {
        console.error('Error getting score table info:', err);
      } else {
        console.log('\nscore table structure:');
        columns.forEach(col => {
          console.log(`  ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}`);
        });
      }
      db.close();
    });
  } else {
    console.log('\nERROR: No score table found in this database!');
    console.log('This appears to be a scorelog.db file, not a score.db file.');
    db.close();
  }
});
