const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// A.S.D.F [EX]の楽曲情報をsongdataテーブルに追加
function addASDFSongData() {
  console.log('=== A.S.D.F [EX]楽曲情報をsongdataに追加 ===');
  
  const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');
  const db = new sqlite3.Database(songdataPath);
  
  const asdfSha256 = 'ASDF1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
  
  // A.S.D.F [EX]の楽曲情報
  const songInfo = {
    md5: 'asdf1234567890abcdef1234567890ab',
    sha256: asdfSha256,
    title: 'A.S.D.F [EX]',
    subtitle: '',
    genre: 'Test Music',
    artist: 'Test Artist',
    subartist: '',
    tag: '',
    path: 'C:\\test\\asdf_ex.bms',
    folder: 'testfolder',
    stagefile: '',
    banner: '',
    backbmp: '',
    preview: '',
    parent: 'testparent',
    level: 12,
    difficulty: 5,
    maxbpm: 150,
    minbpm: 150,
    length: 120000,
    mode: 7,
    judge: 100,
    feature: 0,
    content: 3,
    date: 1722729600, // 2024-08-04
    favorite: 0,
    adddate: 1722729600,
    notes: 1200,
    charthash: 'testcharthash1234567890abcdef1234567890abcdef1234567890abcdef12'
  };
  
  // 既存のデータを削除
  db.run('DELETE FROM song WHERE sha256 = ?', [asdfSha256], (err) => {
    if (err) {
      console.error('既存データ削除エラー:', err);
      return;
    }
    
    // 新しいデータを挿入
    const sql = `
      INSERT INTO song (
        md5, sha256, title, subtitle, genre, artist, subartist, tag, path, folder,
        stagefile, banner, backbmp, preview, parent, level, difficulty, maxbpm, minbpm,
        length, mode, judge, feature, content, date, favorite, adddate, notes, charthash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      songInfo.md5, songInfo.sha256, songInfo.title, songInfo.subtitle, songInfo.genre,
      songInfo.artist, songInfo.subartist, songInfo.tag, songInfo.path, songInfo.folder,
      songInfo.stagefile, songInfo.banner, songInfo.backbmp, songInfo.preview, songInfo.parent,
      songInfo.level, songInfo.difficulty, songInfo.maxbpm, songInfo.minbpm, songInfo.length,
      songInfo.mode, songInfo.judge, songInfo.feature, songInfo.content, songInfo.date,
      songInfo.favorite, songInfo.adddate, songInfo.notes, songInfo.charthash
    ];
    
    db.run(sql, values, function(err) {
      if (err) {
        console.error('楽曲情報挿入エラー:', err);
        return;
      }
      
      console.log(`✅ A.S.D.F [EX]の楽曲情報が挿入されました (rowid: ${this.lastID})`);
      console.log(`SHA256: ${asdfSha256}`);
      console.log(`タイトル: ${songInfo.title}`);
      console.log(`アーティスト: ${songInfo.artist}`);
      console.log(`ノーツ数: ${songInfo.notes}`);
      
      // 挿入されたデータを確認
      db.get('SELECT * FROM song WHERE sha256 = ?', [asdfSha256], (err, row) => {
        if (err) {
          console.error('確認クエリエラー:', err);
          return;
        }
        
        if (row) {
          console.log('\n=== 挿入されたデータの確認 ===');
          console.log(`タイトル: ${row.title}`);
          console.log(`アーティスト: ${row.artist}`);
          console.log(`難易度: ${row.difficulty}`);
          console.log(`ノーツ数: ${row.notes}`);
          console.log(`BPM: ${row.minbpm}${row.maxbpm !== row.minbpm ? '-' + row.maxbpm : ''}`);
        } else {
          console.log('❌ データが見つかりませんでした');
        }
        
        db.close();
        console.log('\n次のステップ: Electronアプリを再起動して、A.S.D.F [EX]が表示されるかテストしてください。');
      });
    });
  });
}

// 実行
addASDFSongData();
