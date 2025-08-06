const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

const scoredatalogPath = path.join(__dirname, 'sample-db', 'scoredatalog.db');
const scorelogPath = path.join(__dirname, 'sample-db', 'scorelog.db');
const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');

const scoredatalogDb = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
const scorelogDb = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);
const songdataDb = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

console.log('=== scoredatalog.db構造確認 ===');

// scoredatalog.dbのテーブル一覧
scoredatalogDb.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
  if (err) {
    console.error('Tables error:', err);
  } else {
    console.log('Scoredatalog Tables:', tables.map(t => t.name));
    
    // scoredatalogテーブルの構造を確認
    if (tables.find(t => t.name === 'scoredatalog')) {
      scoredatalogDb.all(`PRAGMA table_info(scoredatalog)`, (err, columns) => {
        if (err) {
          console.error('Column info error:', err);
        } else {
          console.log('\nscoredatalog テーブルの構造:');
          columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
          });
        }
        
        // 総レコード数
        scoredatalogDb.get(`SELECT COUNT(*) as count FROM scoredatalog`, (err, result) => {
          if (err) {
            console.error('Count error:', err);
          } else {
            console.log(`\n総スコアデータログ数: ${result.count}`);
          }
        });
        
        // 日付範囲
        scoredatalogDb.get(`SELECT MIN(date) as min_date, MAX(date) as max_date FROM scoredatalog`, (err, result) => {
          if (err) {
            console.error('Date range error:', err);
          } else {
            const minDate = dayjs.unix(result.min_date).format('YYYY-MM-DD HH:mm:ss');
            const maxDate = dayjs.unix(result.max_date).format('YYYY-MM-DD HH:mm:ss');
            console.log(`スコアデータログ期間: ${minDate} ～ ${maxDate}`);
          }
        });
        
        // 2025-08-04のデータを詳細表示
        const targetDate = dayjs('2025-08-04');
        const start = targetDate.startOf('day').unix();
        const end = targetDate.endOf('day').unix();
        
        scoredatalogDb.all(`SELECT * FROM scoredatalog WHERE date BETWEEN ? AND ? ORDER BY date ASC LIMIT 5`, [start, end], (err, rows) => {
          if (err) {
            console.error('2025-08-04 scoredatalog error:', err);
          } else {
            console.log(`\n=== 2025-08-04のscoredatalogサンプル（最初の5件） ===`);
            
            rows.forEach((row, index) => {
              const date = dayjs.unix(row.date).format('HH:mm:ss');
              console.log(`${index + 1}. ${date} - SHA256: ${row.sha256.substring(0, 16)}...`);
              
              // judge関連のカラムを表示
              let judgeTotal = 0;
              const judgeColumns = ['epg', 'lpg', 'egr', 'lgr', 'egd', 'lgd', 'ebd', 'lbd', 'epr', 'lpr', 'ems', 'lms'];
              console.log('   判定詳細:');
              judgeColumns.forEach(col => {
                if (row[col] !== undefined) {
                  console.log(`     ${col}: ${row[col]}`);
                  judgeTotal += row[col] || 0;
                }
              });
              console.log(`   判定合計（総ノーツ数）: ${judgeTotal}`);
              
              // 楽曲情報を取得
              songdataDb.get(`SELECT title, artist, notes FROM song WHERE sha256 = ?`, [row.sha256], (err, songInfo) => {
                if (songInfo) {
                  console.log(`   楽曲: ${songInfo.title} / ${songInfo.artist}`);
                  console.log(`   songdata.db のノーツ数: ${songInfo.notes}`);
                  console.log(`   差異: ${judgeTotal - (songInfo.notes || 0)}`);
                }
                console.log('');
              });
            });
            
            // 2025-08-04の全データで総ノーツ数を計算
            scoredatalogDb.all(`SELECT sha256, epg, lpg, egr, lgr, egd, lgd, ebd, lbd, epr, lpr, ems, lms FROM scoredatalog WHERE date BETWEEN ? AND ?`, [start, end], (err, allRows) => {
              if (err) {
                console.error('Total calculation error:', err);
              } else {
                let totalNotesFromJudge = 0;
                const judgeColumns = ['epg', 'lpg', 'egr', 'lgr', 'egd', 'lgd', 'ebd', 'lbd', 'epr', 'lpr', 'ems', 'lms'];
                
                allRows.forEach(row => {
                  let rowTotal = 0;
                  judgeColumns.forEach(col => {
                    rowTotal += row[col] || 0;
                  });
                  totalNotesFromJudge += rowTotal;
                });
                
                console.log(`\n=== 2025-08-04 判定結果による総ノーツ数計算 ===`);
                console.log(`プレイログ数: ${allRows.length}`);
                console.log(`判定結果による総ノーツ数: ${totalNotesFromJudge.toLocaleString()}`);
                
                // checkbestscore関数を実行
                checkbestscore();
              }
            });
          }
        });
      });
    } else {
      console.log('scoredatalogテーブルが見つかりません');
      scoredatalogDb.close();
      scorelogDb.close();
      songdataDb.close();
    }
  }
});

// ベストスコア差分確認関数
function checkbestscore(sha256ToCheck = null, targetDateStr = '2025-08-04') {
  console.log(`\n=== checkbestscore関数実行 ===`);
  console.log(`対象日: ${targetDateStr}`);
  
  const scoredatalogDbForCheck = new sqlite3.Database(scoredatalogPath, sqlite3.OPEN_READONLY);
  const songdataDbForCheck = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);
  
  const targetDate = dayjs(targetDateStr);
  const targetStart = targetDate.startOf('day').unix();
  const targetEnd = targetDate.endOf('day').unix();
  const previousEnd = targetDate.subtract(1, 'day').endOf('day').unix();
  
  // 検査対象楽曲を取得（指定がない場合は当日プレイされた楽曲から）
  if (sha256ToCheck) {
    checkSingleSong(sha256ToCheck);
  } else {
    scoredatalogDbForCheck.all(`
      SELECT DISTINCT sha256 
      FROM scoredatalog 
      WHERE date BETWEEN ? AND ? 
      ORDER BY sha256 
      LIMIT 5
    `, [targetStart, targetEnd], (err, songs) => {
      if (err) {
        console.error('楽曲取得エラー:', err);
        return;
      }
      
      console.log(`${targetDateStr}にプレイされた楽曲から5件を検査:`, songs.length);
      songs.forEach((song, index) => {
        setTimeout(() => {
          console.log(`\n--- 楽曲 ${index + 1}/${songs.length} ---`);
          checkSingleSong(song.sha256);
        }, index * 100);
      });
    });
  }
  
  function checkSingleSong(sha256) {
    // 楽曲情報を取得
    songdataDbForCheck.get(`
      SELECT title, artist, notes 
      FROM song 
      WHERE sha256 = ?
    `, [sha256], (err, songInfo) => {
      if (err) {
        console.error('楽曲情報取得エラー:', err);
        return;
      }
      
      const songTitle = songInfo ? `${songInfo.title} [${songInfo.artist}]` : `楽曲 ${sha256.substring(0, 8)}...`;
      console.log(`楽曲: ${songTitle}`);
      
      // 前日までのベストスコアを取得
      scoredatalogDbForCheck.get(`
        SELECT 
          (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
          minbp, clear, date
        FROM scoredatalog 
        WHERE sha256 = ? AND date <= ?
        ORDER BY (epg + lpg) * 2 + (egr + lgr) * 1 DESC, minbp ASC, clear DESC
        LIMIT 1
      `, [sha256, previousEnd], (err, previousBest) => {
        if (err) {
          console.error('前日ベスト取得エラー:', err);
          return;
        }
        
        // 当日のベストスコアを取得
        scoredatalogDbForCheck.get(`
          SELECT 
            (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
            minbp, clear, date
          FROM scoredatalog 
          WHERE sha256 = ? AND date BETWEEN ? AND ?
          ORDER BY (epg + lpg) * 2 + (egr + lgr) * 1 DESC, minbp ASC, clear DESC
          LIMIT 1
        `, [sha256, targetStart, targetEnd], (err, todayBest) => {
          if (err) {
            console.error('当日ベスト取得エラー:', err);
            return;
          }
          
          // 結果表示
          if (!previousBest && todayBest) {
            console.log(`  初回プレイ: スコア=${todayBest.exscore}, MISS=${todayBest.minbp}, クリア=${todayBest.clear}`);
          } else if (previousBest && todayBest) {
            const scoreDiff = todayBest.exscore - previousBest.exscore;
            const missDiff = previousBest.minbp - todayBest.minbp;
            const clearDiff = todayBest.clear - previousBest.clear;
            
            console.log(`  前日までのベスト: スコア=${previousBest.exscore}, MISS=${previousBest.minbp}, クリア=${previousBest.clear}`);
            console.log(`  当日のベスト: スコア=${todayBest.exscore}, MISS=${todayBest.minbp}, クリア=${todayBest.clear}`);
            console.log(`  差分: スコア=${scoreDiff > 0 ? '+' : ''}${scoreDiff}, MISS=${missDiff > 0 ? '-' : ''}${Math.abs(missDiff)}, クリア=${clearDiff > 0 ? '+' : ''}${clearDiff}`);
            
            // 改善判定
            const improvements = [];
            if (scoreDiff > 0) improvements.push(`スコア+${scoreDiff}`);
            if (missDiff > 0) improvements.push(`MISS-${missDiff}`);
            if (clearDiff > 0) improvements.push(`クリア+${clearDiff}`);
            
            if (improvements.length > 0) {
              console.log(`  ★改善あり: ${improvements.join(', ')}`);
            } else {
              console.log(`  改善なし`);
            }
          } else if (previousBest && !todayBest) {
            console.log(`  当日プレイなし（前日までのベスト: スコア=${previousBest.exscore}）`);
          } else {
            console.log(`  データなし`);
          }
          
          // 当日の全プレイ履歴を表示
          scoredatalogDbForCheck.all(`
            SELECT 
              (epg + lpg) * 2 + (egr + lgr) * 1 as exscore,
              minbp, clear, date
            FROM scoredatalog 
            WHERE sha256 = ? AND date BETWEEN ? AND ?
            ORDER BY date ASC
          `, [sha256, targetStart, targetEnd], (err, allPlays) => {
            if (err) {
              console.error('全プレイ履歴取得エラー:', err);
              return;
            }
            
            if (allPlays.length > 0) {
              console.log(`  当日プレイ履歴（${allPlays.length}回）:`);
              allPlays.forEach((play, index) => {
                const playTime = dayjs.unix(play.date).format('HH:mm:ss');
                console.log(`    ${index + 1}. ${playTime} - スコア=${play.exscore}, MISS=${play.minbp}, クリア=${play.clear}`);
              });
            }
          });
        });
      });
    });
  }
  
  // 5秒後にデータベースを閉じる
  setTimeout(() => {
    scoredatalogDbForCheck.close();
    songdataDbForCheck.close();
    console.log('\n=== checkbestscore関数完了 ===');
  }, 5000);
}
