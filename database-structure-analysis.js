const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const path = require('path');

// サンプルDBパス
const sampleDbPath = path.join(__dirname, 'sample-db');

const databases = [
  { name: 'score.db', path: path.join(sampleDbPath, 'score.db') },
  { name: 'scoredatalog.db', path: path.join(sampleDbPath, 'scoredatalog.db') },
  { name: 'scorelog.db', path: path.join(sampleDbPath, 'scorelog.db') },
  { name: 'songdata.db', path: path.join(sampleDbPath, 'songdata.db') },
  { name: 'songinfo.db', path: path.join(sampleDbPath, 'songinfo.db') }
];

async function analyzeDatabase(dbInfo) {
  console.log(`\n=== ${dbInfo.name} ===`);
  console.log(`Path: ${dbInfo.path}`);
  
  const fs = require('fs');
  if (!fs.existsSync(dbInfo.path)) {
    console.log('❌ ファイルが存在しません');
    return;
  }

  const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY);

  try {
    // 1. テーブル一覧を取得
    const tables = await new Promise((resolve, reject) => {
      db.all(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log(`テーブル数: ${tables.length}`);
    console.log(`テーブル一覧: ${tables.map(t => t.name).join(', ')}`);

    // 2. 各テーブルの詳細分析
    for (const table of tables) {
      console.log(`\n--- テーブル: ${table.name} ---`);
      
      // テーブル構造を取得
      const schema = await new Promise((resolve, reject) => {
        db.all(
          `PRAGMA table_info(${table.name})`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      console.log('カラム構造:');
      schema.forEach((col, index) => {
        console.log(`  ${index + 1}. ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PRIMARY KEY' : ''})`);
      });

      // レコード数を取得
      const count = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count FROM ${table.name}`,
          (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          }
        );
      });

      console.log(`レコード数: ${count}件`);

      if (count > 0) {
        // サンプルデータを取得（最初の3件）
        const samples = await new Promise((resolve, reject) => {
          db.all(
            `SELECT * FROM ${table.name} LIMIT 3`,
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });

        console.log('サンプルデータ（最初の3件）:');
        samples.forEach((sample, index) => {
          console.log(`  ${index + 1}. ${JSON.stringify(sample, null, 2).replace(/\n/g, '\n    ')}`);
        });

        // 特別な分析（テーブル名に応じて）
        if (table.name.includes('score') || table.name.includes('log')) {
          // 日付関連の分析
          const dateColumns = schema.filter(col => 
            col.name.includes('date') || col.name.includes('time') || 
            col.name === 'date' || col.name === 'timestamp'
          );
          
          if (dateColumns.length > 0) {
            const dateCol = dateColumns[0].name;
            const dateRange = await new Promise((resolve, reject) => {
              db.get(
                `SELECT MIN(${dateCol}) as min_date, MAX(${dateCol}) as max_date FROM ${table.name}`,
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });

            if (dateRange.min_date && dateRange.max_date) {
              console.log(`日付範囲 (${dateCol}):`);
              // Unixタイムスタンプかどうか判定
              if (typeof dateRange.min_date === 'number' && dateRange.min_date > 1000000000) {
                console.log(`  最古: ${dayjs.unix(dateRange.min_date).format('YYYY-MM-DD HH:mm:ss')}`);
                console.log(`  最新: ${dayjs.unix(dateRange.max_date).format('YYYY-MM-DD HH:mm:ss')}`);
              } else {
                console.log(`  最古: ${dateRange.min_date}`);
                console.log(`  最新: ${dateRange.max_date}`);
              }
            }
          }

          // SHA256カラムがある場合、ユニーク楽曲数を取得
          const sha256Col = schema.find(col => col.name.toLowerCase().includes('sha256'));
          if (sha256Col) {
            const uniqueSongs = await new Promise((resolve, reject) => {
              db.get(
                `SELECT COUNT(DISTINCT ${sha256Col.name}) as count FROM ${table.name}`,
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row.count);
                }
              );
            });
            console.log(`ユニーク楽曲数 (${sha256Col.name}): ${uniqueSongs}曲`);
          }
        }

        // songdata/songinfoテーブルの場合、楽曲タイトルのサンプル
        if ((table.name.includes('song') || table.name.includes('music')) && count > 0) {
          const titleCol = schema.find(col => 
            col.name.toLowerCase().includes('title') || 
            col.name.toLowerCase().includes('name')
          );
          
          if (titleCol) {
            const titles = await new Promise((resolve, reject) => {
              db.all(
                `SELECT ${titleCol.name} FROM ${table.name} WHERE ${titleCol.name} IS NOT NULL AND ${titleCol.name} != '' LIMIT 5`,
                (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                }
              );
            });

            console.log(`楽曲タイトルサンプル (${titleCol.name}):`);
            titles.forEach((title, index) => {
              console.log(`  ${index + 1}. ${title[titleCol.name]}`);
            });
          }
        }
      }
    }

  } catch (error) {
    console.error(`${dbInfo.name}の分析中にエラーが発生しました:`, error);
  } finally {
    db.close();
  }
}

async function analyzeAllDatabases() {
  console.log('=== beatoraja データベース分析 ===');
  console.log(`分析対象: ${databases.length}個のデータベース`);

  for (const dbInfo of databases) {
    await analyzeDatabase(dbInfo);
  }

  console.log('\n=== 分析完了 ===');
}

// 実行
analyzeAllDatabases().catch(error => {
  console.error('分析エラー:', error);
});
