const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const songdataPath = path.join(sampleDbPath, 'songdata.db');

async function findAsdfSHA256() {
  console.log('=== A.S.D.F [EX] SHA256検索 ===');
  
  const db = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

  try {
    // A.S.D.Fを含むタイトルを検索
    const asdfSongs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sha256, title, artist, difficulty 
         FROM song 
         WHERE title LIKE '%A.S.D.F%' OR title LIKE '%ASDF%'
         ORDER BY title`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (asdfSongs.length > 0) {
      console.log(`✅ A.S.D.F関連楽曲が${asdfSongs.length}件見つかりました:`);
      asdfSongs.forEach((song, index) => {
        console.log(`${index + 1}. ${song.title} - ${song.artist}`);
        console.log(`   SHA256: ${song.sha256}`);
        console.log(`   難易度: ${song.difficulty}`);
        console.log('');
      });
    } else {
      console.log('❌ A.S.D.F関連楽曲が見つかりませんでした');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

// 検索実行
findAsdfSHA256().then(() => {
  console.log('=== 検索完了 ===');
}).catch(error => {
  console.error('検索エラー:', error);
});
