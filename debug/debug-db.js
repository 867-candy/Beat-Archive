const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// サンプルDBの情報を確認
const sampleDbPath = path.join(__dirname, 'sample-db');
const scoreDbPath = path.join(sampleDbPath, 'score.db');
const songdataDbPath = path.join(sampleDbPath, 'songdata.db');

console.log('Checking sample databases...');

// スコアDBの確認
const scoreDB = new sqlite3.Database(scoreDbPath, sqlite3.OPEN_READONLY);

scoreDB.serialize(() => {
  // テーブル一覧
  scoreDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
    if (err) {
      console.error('Score DB tables error:', err);
    } else {
      console.log('Score DB tables:', tables.map(t => t.name));
      
      // スコアテーブルの件数確認
      if (tables.find(t => t.name === 'score')) {
        scoreDB.get(`SELECT COUNT(*) as count FROM score`, (err, result) => {
          if (err) {
            console.error('Score count error:', err);
          } else {
            console.log('Score records:', result.count);
            
            // 最初の数件を表示
            scoreDB.all(`SELECT sha256, epg, egr, lpg, lgr, clear FROM score LIMIT 5`, (err, rows) => {
              if (err) {
                console.error('Score sample error:', err);
              } else {
                console.log('Sample score records:', rows);
              }
              
              scoreDB.close();
            });
          }
        });
      } else {
        console.log('No score table found');
        scoreDB.close();
      }
    }
  });
});

// 楽曲データDBの確認
const songdataDB = new sqlite3.Database(songdataDbPath, sqlite3.OPEN_READONLY);

songdataDB.serialize(() => {
  // テーブル一覧
  songdataDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
    if (err) {
      console.error('Songdata DB tables error:', err);
    } else {
      console.log('Songdata DB tables:', tables.map(t => t.name));
      
      // 楽曲テーブルの件数確認
      if (tables.find(t => t.name === 'song')) {
        songdataDB.get(`SELECT COUNT(*) as count FROM song`, (err, result) => {
          if (err) {
            console.error('Song count error:', err);
          } else {
            console.log('Song records:', result.count);
            
            // 最初の数件を表示
            songdataDB.all(`SELECT sha256, title, artist, notes FROM song LIMIT 5`, (err, rows) => {
              if (err) {
                console.error('Song sample error:', err);
              } else {
                console.log('Sample song records:', rows);
              }
              
              songdataDB.close();
            });
          }
        });
      } else {
        console.log('No song table found');
        songdataDB.close();
      }
    }
  });
});
