const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');
const db = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

console.log('=== songdataデータベース詳細確認 ===');

// 全楽曲のノーツ数統計
db.all(`SELECT COUNT(*) as total_songs, SUM(notes) as total_notes, AVG(notes) as avg_notes, MAX(notes) as max_notes, MIN(notes) as min_notes FROM song WHERE notes > 0`, (err, rows) => {
  if (err) {
    console.error('統計クエリエラー:', err);
  } else {
    console.log('楽曲統計:', rows[0]);
  }
});

// ノーツ数上位10曲
db.all(`SELECT title, notes FROM song WHERE notes > 0 ORDER BY notes DESC LIMIT 10`, (err, rows) => {
  if (err) {
    console.error('上位楽曲クエリエラー:', err);
  } else {
    console.log('\nノーツ数上位10曲:');
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.title}: ${row.notes}ノーツ`);
    });
  }
});

// 2025-08-04にプレイされた楽曲のノーツ数確認
const scorelogPath = path.join(__dirname, 'sample-db', 'scorelog.db');
const scorelogDb = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);

const dayjs = require('dayjs');
const targetDate = dayjs('2025-08-04');
const start = targetDate.startOf('day').unix();
const end = targetDate.endOf('day').unix();

scorelogDb.all(`SELECT DISTINCT sha256 FROM scorelog WHERE date BETWEEN ? AND ?`, [start, end], (err, playedSongs) => {
  if (err) {
    console.error('プレイログクエリエラー:', err);
    db.close();
    scorelogDb.close();
    return;
  }
  
  console.log(`\n2025-08-04にプレイされた楽曲数: ${playedSongs.length}`);
  
  // プレイされた楽曲のノーツ数詳細
  const placeholders = playedSongs.map(() => '?').join(',');
  const sha256List = playedSongs.map(song => song.sha256);
  
  db.all(`SELECT title, notes FROM song WHERE sha256 IN (${placeholders}) AND notes > 0 ORDER BY notes DESC`, sha256List, (err, playedSongDetails) => {
    if (err) {
      console.error('プレイ楽曲詳細クエリエラー:', err);
    } else {
      console.log('\nプレイされた楽曲のノーツ数詳細:');
      let totalPlayedNotes = 0;
      playedSongDetails.forEach((song, index) => {
        console.log(`${index + 1}. ${song.title}: ${song.notes}ノーツ`);
        totalPlayedNotes += song.notes;
      });
      console.log(`\nプレイされた楽曲の総ノーツ数: ${totalPlayedNotes}`);
    }
    
    db.close();
    scorelogDb.close();
  });
});
