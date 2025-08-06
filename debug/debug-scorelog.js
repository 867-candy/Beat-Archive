const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

const scorelogPath = path.join(__dirname, 'sample-db', 'scorelog.db');
const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');
const scorelogDb = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);
const songdataDb = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

console.log('=== scorelog.db & songdata.db 詳細確認 ===');

// まずsongdata.dbの構造を確認
songdataDb.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
  if (err) {
    console.error('Songdata tables error:', err);
  } else {
    console.log('Songdata Tables:', tables.map(t => t.name));
    
    // songテーブルの構造を確認
    if (tables.find(t => t.name === 'song')) {
      songdataDb.all(`PRAGMA table_info(song)`, (err, columns) => {
        if (err) {
          console.error('Song column info error:', err);
        } else {
          console.log('\nsongテーブルの構造:');
          columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
          });
        }
        
        // scorelogの分析を開始
        analyzeScorelog();
      });
    } else {
      console.log('songテーブルが見つかりません');
      analyzeScorelog();
    }
  }
});

function analyzeScorelog() {

// テーブル一覧
scorelogDb.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
  if (err) {
    console.error('Tables error:', err);
  } else {
    console.log('\nScorelog Tables:', tables.map(t => t.name));
    
    // scorelogテーブルの構造を確認
    if (tables.find(t => t.name === 'scorelog')) {
      scorelogDb.all(`PRAGMA table_info(scorelog)`, (err, columns) => {
        if (err) {
          console.error('Column info error:', err);
        } else {
          console.log('\nscorelogテーブルの構造:');
          columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
          });
        }
      });
      
      // 総レコード数
      scorelogDb.get(`SELECT COUNT(*) as count FROM scorelog`, (err, result) => {
        if (err) {
          console.error('Count error:', err);
        } else {
          console.log(`\n総プレイログ数: ${result.count}`);
        }
      });
      
      // 日付範囲
      scorelogDb.get(`SELECT MIN(date) as min_date, MAX(date) as max_date FROM scorelog`, (err, result) => {
        if (err) {
          console.error('Date range error:', err);
        } else {
          const minDate = dayjs.unix(result.min_date).format('YYYY-MM-DD HH:mm:ss');
          const maxDate = dayjs.unix(result.max_date).format('YYYY-MM-DD HH:mm:ss');
          console.log(`プレイ記録期間: ${minDate} ～ ${maxDate}`);
        }
      });
      
      // 2025-08-04のプレイログを詳細表示（楽曲情報付き）
      const targetDate = dayjs('2025-08-04');
      const start = targetDate.startOf('day').unix();
      const end = targetDate.endOf('day').unix();
      
      scorelogDb.all(`SELECT * FROM scorelog WHERE date BETWEEN ? AND ? ORDER BY date ASC`, [start, end], (err, rows) => {
        if (err) {
          console.error('2025-08-04 logs error:', err);
        } else {
          console.log(`\n=== 2025-08-04のプレイログ詳細: ${rows.length}件 ===`);
          
          let totalNotes = 0;
          let processedCount = 0;
          
          rows.forEach((row, index) => {
            const date = dayjs.unix(row.date).format('HH:mm:ss');
            
            // songdata.dbから楽曲情報を取得
            songdataDb.get(`SELECT title, artist, notes FROM song WHERE sha256 = ?`, [row.sha256], (err, songInfo) => {
              if (err) {
                console.error('Song info error:', err);
              }
              
              const title = songInfo ? songInfo.title : '不明な楽曲';
              const artist = songInfo ? songInfo.artist : '不明なアーティスト';
              const notes = songInfo ? songInfo.notes : 0;
              
              if (notes) totalNotes += notes;
              
              console.log(`${index + 1}. ${date} - ${title} / ${artist}`);
              console.log(`   SHA256: ${row.sha256.substring(0, 16)}...`);
              console.log(`   Clear: ${row.clear} - Score: ${row.score || 'N/A'} - Notes: ${notes}`);
              console.log(`   Combo: ${row.combo || 0} (最大), MinBP: ${row.minbp || 0} (ミス数)`);
              
              // 判定率を計算
              if (notes > 0 && row.combo !== undefined && row.minbp !== undefined) {
                const accuracy = ((notes - (row.minbp || 0)) / notes * 100).toFixed(2);
                console.log(`   判定率: ${accuracy}% (${notes - (row.minbp || 0)}/${notes})`);
              }
              console.log('');
              
              processedCount++;
              
              // 全ての楽曲情報を処理完了したら総ノーツ数を表示
              if (processedCount === rows.length) {
                console.log(`=== 2025-08-04 総計 ===`);
                console.log(`総プレイ回数: ${rows.length}`);
                console.log(`総ノーツ数: ${totalNotes.toLocaleString()}`);
                
                // SHA256ごとのプレイ回数をカウント
                const sha256Counts = new Map();
                rows.forEach(row => {
                  const short = row.sha256.substring(0, 8);
                  sha256Counts.set(short, (sha256Counts.get(short) || 0) + 1);
                });
                
                console.log(`ユニーク楽曲数: ${sha256Counts.size}`);
                
                // 複数回プレイされた楽曲
                const multiplePlaySongs = Array.from(sha256Counts.entries()).filter(([_, count]) => count > 1);
                if (multiplePlaySongs.length > 0) {
                  console.log('\n複数回プレイされた楽曲:');
                  multiplePlaySongs.forEach(([sha256Short, count]) => {
                    console.log(`  ${sha256Short}...: ${count}回`);
                  });
                }
                
                // データベースを閉じる
                scorelogDb.close();
                songdataDb.close();
              }
            });
          });
          
          if (rows.length === 0) {
            console.log('該当する日付のプレイログが見つかりませんでした。');
            scorelogDb.close();
            songdataDb.close();
          }
        }
      });
    } else {
      console.log('scorelogテーブルが見つかりません');
      scorelogDb.close();
      songdataDb.close();
    }
  }
});
}
