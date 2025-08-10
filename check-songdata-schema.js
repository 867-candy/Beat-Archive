const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');

console.log('songdata.dbのスキーマを確認中...');
console.log('DBパス:', songdataPath);

const db = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
    return;
  }
  console.log('songdata.dbに接続しました');
});

// スキーマを取得
db.all(`SELECT sql FROM sqlite_master WHERE type='table'`, (err, tables) => {
  if (err) {
    console.error('スキーマ取得エラー:', err.message);
    db.close();
    return;
  }

  console.log('\n=== テーブルスキーマ ===');
  tables.forEach((table, index) => {
    console.log(`\n${index + 1}. ${table.sql}`);
  });

  // サンプルデータを取得
  db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tableNames) => {
    if (err) {
      console.error('テーブル名取得エラー:', err.message);
      db.close();
      return;
    }

    console.log('\n=== テーブル一覧 ===');
    tableNames.forEach(table => {
      console.log(table.name);
    });

    // 最初のテーブルのサンプルデータを取得
    if (tableNames.length > 0) {
      const firstTable = tableNames[0].name;
      console.log(`\n=== ${firstTable} サンプルデータ (最初の3行) ===`);
      
      db.all(`SELECT * FROM ${firstTable} LIMIT 3`, (err, rows) => {
        if (err) {
          console.error('データ取得エラー:', err.message);
        } else {
          console.log(JSON.stringify(rows, null, 2));
        }
        
        db.close();
      });
    } else {
      db.close();
    }
  });
});
