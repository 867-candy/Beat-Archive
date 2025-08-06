const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');
const databases = {
  scoredatalog: path.join(sampleDbPath, 'scoredatalog.db'),
  scorelog: path.join(sampleDbPath, 'scorelog.db'),
  score: path.join(sampleDbPath, 'score.db'),
  songdata: path.join(sampleDbPath, 'songdata.db'),
  songinfo: path.join(sampleDbPath, 'songinfo.db')
};

async function analyzeAllDatabases() {
  console.log('=== 全データベース分析：複数日記録検索 ===');
  console.log('');

  for (const [dbName, dbPath] of Object.entries(databases)) {
    console.log(`--- ${dbName.toUpperCase()} データベース分析 ---`);
    console.log(`パス: ${dbPath}`);

    // ファイル存在チェック
    const fs = require('fs');
    if (!fs.existsSync(dbPath)) {
      console.log('❌ ファイルが存在しません');
      console.log('');
      continue;
    }

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    try {
      // テーブル一覧を取得
      const tables = await new Promise((resolve, reject) => {
        db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      console.log(`テーブル: ${tables.map(t => t.name).join(', ')}`);

      // 各テーブルの構造を確認
      for (const table of tables) {
        const tableName = table.name;
        console.log(`\n[${tableName}テーブル]`);

        // テーブル構造を取得
        const columns = await new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        const columnNames = columns.map(col => col.name);
        console.log(`カラム: ${columnNames.join(', ')}`);

        // レコード数を確認
        const recordCount = await new Promise((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        console.log(`レコード数: ${recordCount}件`);

        // 日付系カラムがあるかチェック
        const dateColumns = columnNames.filter(col => 
          col.toLowerCase().includes('date') || 
          col.toLowerCase().includes('time') ||
          col.toLowerCase().includes('play')
        );

        if (dateColumns.length > 0) {
          console.log(`日付系カラム: ${dateColumns.join(', ')}`);

          // SHA256とdate系カラムがあるかチェック
          const hasSHA256 = columnNames.includes('sha256');
          const hasDate = dateColumns.length > 0;

          if (hasSHA256 && hasDate && recordCount > 0) {
            console.log('🔍 複数日記録をチェック中...');

            // 複数日記録の検索
            const dateColumn = dateColumns[0]; // 最初の日付カラムを使用
            
            try {
              const multiDayQuery = `
                SELECT 
                  sha256,
                  COUNT(DISTINCT DATE(${dateColumn}, 'unixepoch')) as day_count,
                  COUNT(*) as total_records,
                  MIN(${dateColumn}) as first_record,
                  MAX(${dateColumn}) as last_record
                FROM ${tableName} 
                WHERE sha256 IS NOT NULL AND ${dateColumn} IS NOT NULL
                GROUP BY sha256
                HAVING day_count > 1
                ORDER BY day_count DESC, total_records DESC
                LIMIT 5
              `;

              const multiDayRecords = await new Promise((resolve, reject) => {
                db.all(multiDayQuery, (err, rows) => {
                  if (err) {
                    console.log(`⚠️ 複数日記録検索でエラー: ${err.message}`);
                    resolve([]);
                  } else {
                    resolve(rows);
                  }
                });
              });

              if (multiDayRecords.length > 0) {
                console.log(`✅ ${multiDayRecords.length}件の複数日記録を発見！`);
                multiDayRecords.forEach((record, index) => {
                  const firstDate = dayjs.unix(record.first_record).format('YYYY-MM-DD');
                  const lastDate = dayjs.unix(record.last_record).format('YYYY-MM-DD');
                  console.log(`  ${index + 1}. SHA256: ${record.sha256.substring(0, 12)}...`);
                  console.log(`     ${record.day_count}日間, ${record.total_records}記録, ${firstDate} - ${lastDate}`);
                });
              } else {
                console.log('❌ 複数日記録なし');
              }
            } catch (error) {
              console.log(`⚠️ 複数日記録検索でエラー: ${error.message}`);
            }
          } else {
            if (!hassha256) console.log('❌ SHA256カラムなし');
            if (!hasDate) console.log('❌ 日付カラムなし');
          }
        } else {
          console.log('❌ 日付系カラムなし');
        }
      }

    } catch (error) {
      console.error(`❌ ${dbName}の分析でエラー:`, error.message);
    } finally {
      db.close();
    }

    console.log('');
  }

  // 楽曲情報データベースで楽曲名を取得できる上位楽曲を確認
  console.log('--- 楽曲名取得テスト ---');
  const songdataDB = new sqlite3.Database(databases.songdata, sqlite3.OPEN_READONLY);
  
  try {
    const sampleSongs = await new Promise((resolve, reject) => {
      songdataDB.all(
        `SELECT sha256, title, artist FROM song LIMIT 10`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log('サンプル楽曲（楽曲名取得テスト用）:');
    sampleSongs.forEach((song, index) => {
      console.log(`${index + 1}. ${song.title || '[タイトル不明]'} - ${song.artist || '[アーティスト不明]'}`);
      console.log(`   SHA256: ${song.sha256.substring(0, 12)}...`);
    });

  } catch (error) {
    console.error('楽曲名取得テストでエラー:', error.message);
  } finally {
    songdataDB.close();
  }
}

// 実行
analyzeAllDatabases().then(() => {
  console.log('\n=== 全データベース分析完了 ===');
}).catch(error => {
  console.error('分析エラー:', error);
});
