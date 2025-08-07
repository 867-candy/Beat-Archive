const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// songdata.dbのパスを設定
const songdataPath = 'E:\\beatoraja0.8.4-jre-win64\\songdata.db';

console.log('songdata.dbの構造とSUBTITLE情報を確認中...');
console.log('DBパス:', songdataPath);

const db = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
    return;
  }
  console.log('songdata.dbに接続しました');
});

// テーブル構造を確認
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('テーブル一覧取得エラー:', err);
    return;
  }
  
  console.log('\n=== テーブル一覧 ===');
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });
  
  // songテーブルの構造を確認
  db.all("PRAGMA table_info(song)", (err, columns) => {
    if (err) {
      console.error('テーブル構造取得エラー:', err);
      return;
    }
    
    console.log('\n=== songテーブルの構造 ===');
    columns.forEach(column => {
      console.log(`${column.name}: ${column.type} (NULL: ${column.notnull === 0 ? 'OK' : 'NG'})`);
    });
    
    // 指定されたSHA256の楽曲を検索
    const targetSha256 = '4143f8eafdc7e10b547dd63a3810f9033b2f950b6c1dae01fa1d3649c5649ebf';
    console.log(`\n=== SHA256: ${targetSha256} の楽曲情報 ===`);
    
    db.all(`SELECT * FROM song WHERE sha256 = ?`, [targetSha256], (err, rows) => {
      if (err) {
        console.error('楽曲検索エラー:', err);
        return;
      }
      
      if (rows.length === 0) {
        console.log('指定されたSHA256の楽曲が見つかりませんでした');
      } else {
        rows.forEach((row, index) => {
          console.log(`\n--- 楽曲 ${index + 1} ---`);
          Object.keys(row).forEach(key => {
            console.log(`${key}: ${row[key]}`);
          });
        });
      }
      
      // 「村」というタイトルを含む楽曲をすべて検索
      console.log(`\n=== タイトルに「村」を含む楽曲一覧 ===`);
      db.all(`SELECT sha256, title, subtitle, artist FROM song WHERE title LIKE '%村%' LIMIT 10`, (err, rows) => {
        if (err) {
          console.error('楽曲検索エラー:', err);
          return;
        }
        
        rows.forEach((row, index) => {
          console.log(`${index + 1}. ${row.title}${row.subtitle ? ` [${row.subtitle}]` : ''} - ${row.artist}`);
          console.log(`   SHA256: ${row.sha256}`);
        });
        
        // SUBTITLEがある楽曲のサンプルを表示
        console.log(`\n=== SUBTITLEがある楽曲のサンプル ===`);
        db.all(`SELECT sha256, title, subtitle, artist FROM song WHERE subtitle IS NOT NULL AND subtitle != '' LIMIT 10`, (err, rows) => {
          if (err) {
            console.error('楽曲検索エラー:', err);
            return;
          }
          
          rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.title} [${row.subtitle}] - ${row.artist}`);
            console.log(`   SHA256: ${row.sha256}`);
          });
          
          db.close();
        });
      });
    });
  });
});
