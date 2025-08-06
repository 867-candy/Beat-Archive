const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const https = require('https');
const http = require('http');

// 難易度表データのキャッシュ
let difficultyTablesCache = null;
let difficultyTablesLastUpdated = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30分

// HTTP/HTTPSリクエスト関数
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// 難易度表データを取得
async function loadDifficultyTables(config) {
  const now = Date.now();
  
  // キャッシュが有効な場合は再利用
  if (difficultyTablesCache && (now - difficultyTablesLastUpdated) < CACHE_DURATION) {
    return difficultyTablesCache;
  }
  
  const tables = [];
  
  for (const tableConfig of config.difficultyTables || []) {
    try {
      console.log(`Loading difficulty table: ${tableConfig.name} from ${tableConfig.url}`);
      
      // ヘッダ部を取得
      const header = await fetchJson(tableConfig.url);
      
      // データ部を取得
      const dataUrl = header.data_url;
      const data = await fetchJson(dataUrl);
      
      tables.push({
        ...tableConfig,
        header,
        data,
        symbol: header.symbol || '',
        levelOrder: header.level_order || []
      });
      
    } catch (error) {
      console.warn(`Failed to load difficulty table ${tableConfig.name}:`, error.message);
    }
  }
  
  // 優先順位でソート
  tables.sort((a, b) => a.priority - b.priority);
  
  difficultyTablesCache = tables;
  difficultyTablesLastUpdated = now;
  
  return tables;
}

// 譜面のmd5/sha256から難易度表情報を検索
function findChartInTables(tables, md5, sha256) {
  for (const table of tables) {
    for (const chart of table.data) {
      if ((md5 && chart.md5 === md5) || (sha256 && chart.sha256 === sha256)) {
        return {
          table,
          chart,
          symbol: table.symbol,
          level: chart.level,
          levelOrder: table.levelOrder
        };
      }
    }
  }
  return null;
}

// レベル順序を数値化（ソート用）
function getLevelOrderIndex(level, levelOrder) {
  if (!levelOrder || levelOrder.length === 0) {
    // デフォルトの数値ソート
    const numLevel = parseFloat(level);
    return isNaN(numLevel) ? 999 : numLevel;
  }
  
  const index = levelOrder.indexOf(level);
  return index >= 0 ? index : levelOrder.length + parseFloat(level) || 999;
}

// クリアタイプの定義
const CLEAR_TYPES = {
  0: 'NO PLAY',
  1: 'FAILED',
  2: 'ASSIST EASY CLEAR',
  3: 'LIGHT ASSIST CLEAR',
  4: 'EASY CLEAR',
  5: 'CLEAR',
  6: 'HARD CLEAR',
  7: 'EX HARD CLEAR',
  8: 'FULL COMBO'
};

function getClearTypeName(clearType) {
  return CLEAR_TYPES[clearType] || `UNKNOWN(${clearType})`;
}

// beatorajaのスコアを計算する関数
function calculateScore(scoreData) {
  if (!scoreData) return 0;
  
  // beatorajaのスコア計算方式
  const { epg = 0, lpg = 0, egr = 0, lgr = 0, egd = 0, lgd = 0, notes = 0 } = scoreData;
  
  if (notes === 0) return 0;
  
  // スコア = (EXCELLENT PG * 2 + LATE PG * 2 + EXCELLENT GR * 1 + LATE GR * 1) / (notes * 2) * 100
  const totalScore = (epg * 2 + lpg * 2 + egr * 1 + lgr * 1);
  const maxScore = notes * 2;
  
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

// SCORE仕様に基づくスコア計算（IIDX仕様）
function calculateIIDXScore(scoreData) {
  if (!scoreData) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  const { epg = 0, lpg = 0, egr = 0, lgr = 0, notes = 0 } = scoreData;
  
  if (notes === 0) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  // SCORE仕様: P-GREAT(epg+lpg) = 2点, GREAT(egr+lgr) = 1点
  const score = (epg + lpg) * 2 + (egr + lgr) * 1;
  const maxScore = notes * 2;
  
  // DJ LEVEL計算
  let djLevel = 'F';
  if (maxScore > 0) {
    const ratio = score / maxScore;
    if (ratio >= 8/9) djLevel = 'AAA';
    else if (ratio >= 7/9) djLevel = 'AA';
    else if (ratio >= 6/9) djLevel = 'A';
    else if (ratio >= 5/9) djLevel = 'B';
    else if (ratio >= 4/9) djLevel = 'C';
    else if (ratio >= 3/9) djLevel = 'D';
    else if (ratio >= 2/9) djLevel = 'E';
  }
  
  return { score, maxScore, djLevel };
}

let configPath = path.join(app.getPath('userData'), 'config.json');
let localDbPath = path.join(app.getPath('userData'), 'local-data.db');

// デバッグ用：開発環境でのサンプルDBパス
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
const sampleDbPath = path.join(__dirname, 'sample-db');

if (isDevelopment) {
  localDbPath = path.join(__dirname, 'local-data.db');
}

let config = {
  dbPaths: {
    score: '',
    scorelog: '',
    songdata: ''
  }
};

function loadConfig() {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath));
  } else {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
  
  // 開発環境でサンプルDBを自動読み込み
  if (isDevelopment) {
    loadSampleDbIfAvailable();
  }
}

function loadSampleDbIfAvailable() {
  const sampleFiles = {
    score: path.join(sampleDbPath, 'score.db'),
    scorelog: path.join(sampleDbPath, 'scorelog.db'),
    songdata: path.join(sampleDbPath, 'songdata.db')
  };
  
  let hasAllSampleFiles = true;
  for (const [key, filePath] of Object.entries(sampleFiles)) {
    if (!fs.existsSync(filePath)) {
      hasAllSampleFiles = false;
      console.log(`サンプルDBファイルが見つかりません: ${filePath}`);
    }
  }
  
  if (hasAllSampleFiles) {
    console.log('開発環境: サンプルDBファイルを読み込みます');
    config.dbPaths = sampleFiles;
    console.log('サンプルDBパス:', config.dbPaths);
  } else {
    console.log('開発環境: サンプルDBファイルの一部が見つからないため、通常の設定ファイルを使用します');
    console.log('以下のファイルをsample-dbフォルダに配置してください:');
    console.log('- score.db');
    console.log('- scorelog.db'); 
    console.log('- songdata.db');
  }
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function initializeLocalDatabase() {
  // アプリケーション専用のローカルデータベースを初期化
  // beatorajaのDBファイルとは独立して管理
  if (!fs.existsSync(localDbPath)) {
    const localDB = new sqlite3.Database(localDbPath);
    
    localDB.serialize(() => {
      // 楽曲の最高記録スナップショット
      localDB.run(`
        CREATE TABLE IF NOT EXISTS score_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sha256 TEXT NOT NULL,
          score INTEGER,
          minbp INTEGER,
          clear INTEGER,
          iidxScore INTEGER,
          date INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(sha256, date)
        )
      `);
      
      // 日別の更新記録
      localDB.run(`
        CREATE TABLE IF NOT EXISTS daily_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sha256 TEXT NOT NULL,
          play_date INTEGER NOT NULL,
          update_type TEXT NOT NULL,
          old_value INTEGER,
          new_value INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      
      // 最後にチェックした日付
      localDB.run(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id INTEGER PRIMARY KEY,
          last_sync_date INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      
      console.log('ローカルデータベースを初期化しました');
    });
    
    localDB.close();
  } else {
    // 既存のDBにiidxScoreカラムを追加（存在しない場合）
    const localDB = new sqlite3.Database(localDbPath);
    localDB.run(`ALTER TABLE score_history ADD COLUMN iidxScore INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('iidxScoreカラム追加エラー:', err);
      } else if (!err) {
        console.log('iidxScoreカラムを追加しました');
      }
    });
    localDB.close();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  loadConfig();
  initializeLocalDatabase();
  createWindow();
});

// DBパスの取得
ipcMain.handle('get-config', () => {
  return config;
});

// DBパスの更新
ipcMain.handle('set-config', (_, newPaths) => {
  config.dbPaths = newPaths;
  saveConfig();
});

// ファイル選択ダイアログ
ipcMain.handle('select-db-path', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// クリアタイプ名を取得
ipcMain.handle('get-clear-type-name', (_, clearType) => {
  return getClearTypeName(clearType);
});

// データベース構造確認（読み取り専用）
ipcMain.handle('check-db-structure', async () => {
  const { score, scorelog, songdata } = config.dbPaths;
  if (!fs.existsSync(score) || !fs.existsSync(scorelog) || !fs.existsSync(songdata)) {
    throw new Error('DBファイルが見つかりません。設定を確認してください。');
  }

  const results = {};

  // beatorajaのDBファイルは全て読み取り専用で開く
  const scorelogDB = new sqlite3.Database(scorelog, sqlite3.OPEN_READONLY);
  const scorelogTables = await new Promise((resolve, reject) => {
    scorelogDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.scorelog = scorelogTables;

  // 開発環境では各テーブルの詳細構造も取得
  if (isDevelopment && scorelogTables.length > 0) {
    console.log('=== scorelogDB テーブル構造 ===');
    for (const table of scorelogTables) {
      const tableInfo = await new Promise((resolve, reject) => {
        scorelogDB.all(`PRAGMA table_info(${table.name})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      console.log(`テーブル: ${table.name}`);
      console.log('カラム:', tableInfo.map(col => `${col.name} (${col.type})`).join(', '));
      
      // サンプルデータを数件取得
      const sampleData = await new Promise((resolve, reject) => {
        scorelogDB.all(`SELECT * FROM ${table.name} LIMIT 3`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      if (sampleData.length > 0) {
        console.log('サンプルデータ:', sampleData[0]);
      }
      console.log('---');
    }
  }

  // scoreDBのテーブル一覧を取得（読み取り専用）
  const scoreDB = new sqlite3.Database(score, sqlite3.OPEN_READONLY);
  const scoreTables = await new Promise((resolve, reject) => {
    scoreDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.score = scoreTables;

  // 開発環境では各テーブルの詳細構造も取得
  if (isDevelopment && scoreTables.length > 0) {
    console.log('=== scoreDB テーブル構造 ===');
    for (const table of scoreTables) {
      const tableInfo = await new Promise((resolve, reject) => {
        scoreDB.all(`PRAGMA table_info(${table.name})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      console.log(`テーブル: ${table.name}`);
      console.log('カラム:', tableInfo.map(col => `${col.name} (${col.type})`).join(', '));
      
      // サンプルデータを数件取得
      const sampleData = await new Promise((resolve, reject) => {
        scoreDB.all(`SELECT * FROM ${table.name} LIMIT 3`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      if (sampleData.length > 0) {
        console.log('サンプルデータ:', sampleData[0]);
      }
      console.log('---');
    }
  }

  // songdataDBのテーブル一覧を取得（読み取り専用）
  const songdataDB = new sqlite3.Database(songdata, sqlite3.OPEN_READONLY);
  const songdataTables = await new Promise((resolve, reject) => {
    songdataDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.songdata = songdataTables;

  // 開発環境では各テーブルの詳細構造も取得
  if (isDevelopment && songdataTables.length > 0) {
    console.log('=== songdataDB テーブル構造 ===');
    for (const table of songdataTables) {
      const tableInfo = await new Promise((resolve, reject) => {
        songdataDB.all(`PRAGMA table_info(${table.name})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      console.log(`テーブル: ${table.name}`);
      console.log('カラム:', tableInfo.map(col => `${col.name} (${col.type})`).join(', '));
      
      // サンプルデータを数件取得
      const sampleData = await new Promise((resolve, reject) => {
        songdataDB.all(`SELECT * FROM ${table.name} LIMIT 3`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      if (sampleData.length > 0) {
        console.log('サンプルデータ:', sampleData[0]);
      }
      console.log('---');
    }
  }

  scorelogDB.close();
  scoreDB.close();
  songdataDB.close();

  return results;
});

// 更新された楽曲を検出（読み取り専用アプローチ + 難易度表対応）
// beatorajaのDBファイルは全て読み取り専用として扱い、
// アプリケーション側のローカルDBで履歴を管理
ipcMain.handle('get-updated-songs', async (_, dateString) => {
  const { score, scorelog, songdata } = config.dbPaths;
  if (!fs.existsSync(score) || !fs.existsSync(scorelog) || !fs.existsSync(songdata)) {
    throw new Error('DBファイルが見つかりません。設定を確認してください。');
  }

  let scorelogDB, scoreDB, songdataDB, localDB;

  try {
    // 難易度表データを読み込み
    const difficultyTables = await loadDifficultyTables(config);
    
    // 読み取り専用でDBを開く
    scorelogDB = new sqlite3.Database(scorelog, sqlite3.OPEN_READONLY);
    scoreDB = new sqlite3.Database(score, sqlite3.OPEN_READONLY);
    songdataDB = new sqlite3.Database(songdata, sqlite3.OPEN_READONLY);
    localDB = new sqlite3.Database(localDbPath); // ローカルDBのみ書き込み可能

    const targetDate = dayjs(dateString);
    const start = targetDate.startOf('day').unix();
    const end = targetDate.endOf('day').unix();

    console.log(`${dateString}の更新データを検索中...`);
    
    // テーブル名を動的に取得（読み取り専用）
    const scorelogTables = await new Promise((resolve, reject) => {
      scorelogDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });
    
    const scoreTables = await new Promise((resolve, reject) => {
      scoreDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });
    
    const songdataTables = await new Promise((resolve, reject) => {
      songdataDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });

    const logTableName = scorelogTables.find(t => 
      t.name.includes('score') || t.name.includes('log') || t.name.includes('play')
    )?.name || scorelogTables[0]?.name;
    
    const scoreTableName = scoreTables.find(t => 
      t.name.includes('score') || t.name.includes('song')
    )?.name || scoreTables[0]?.name;
    
    const songdataTableName = songdataTables.find(t => 
      t.name.includes('song') || t.name.includes('music') || t.name.includes('data')
    )?.name || songdataTables[0]?.name;

    if (isDevelopment) {
      console.log(`使用テーブル: scorelog=${logTableName}, score=${scoreTableName}, songdata=${songdataTableName}`);
    }

    // その日のプレイログを取得（読み取り専用）
    const logs = await new Promise((resolve, reject) => {
      scorelogDB.all(
        `SELECT * FROM ${logTableName} WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
        [start, end],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    console.log(`${logs.length}件のプレイログが見つかりました`);

    const result = [];
    const processedSongs = new Set();
    let debugShown = false;

    for (const row of logs) {
      // 既に処理済みの楽曲はスキップ
      if (processedSongs.has(row.sha256)) continue;
      processedSongs.add(row.sha256);

      // 前日以前の最高記録を取得（ローカルDBから）
      const previousDay = targetDate.subtract(1, 'day').endOf('day').unix();
      const previousBest = await new Promise((resolve, reject) => {
        localDB.get(
          `SELECT * FROM score_history WHERE sha256 = ? AND date <= ? ORDER BY date DESC LIMIT 1`,
          [row.sha256, previousDay],
          (err, data) => err ? reject(err) : resolve(data)
        );
      });

      // 現在の最高記録を取得（beatoraja DBから読み取り専用）
      const currentBest = await new Promise((resolve, reject) => {
        scoreDB.get(
          `SELECT * FROM ${scoreTableName} WHERE sha256 = ?`,
          [row.sha256],
          (err, data) => {
            if (err) {
              reject(err);
            } else {
              // デバッグ用：最初の1回だけテーブル構造を表示
              if (isDevelopment && data && !debugShown) {
                console.log('スコアテーブルのカラム:', Object.keys(data));
                debugShown = true;
              }
              resolve(data);
            }
          }
        );
      });

      if (!currentBest) continue;

      // スコアの値を取得（複数のカラム名に対応）
      const currentScore = calculateScore(currentBest);
      const currentMinbp = currentBest.minbp || currentBest.minbad || currentBest.bad || 999999;
      const currentClear = currentBest.clear || currentBest.cleartype || 0;
      
      // IIDX仕様のSCORE・DJ LEVEL計算
      const iidxScore = calculateIIDXScore(currentBest);

      // その日に最高記録が更新されたかチェック
      const hasUpdate = !previousBest || 
        currentScore > (previousBest.score || 0) ||
        currentMinbp < (previousBest.minbp || 999999) ||
        currentClear !== (previousBest.clear || 0) ||
        iidxScore.score > (previousBest.iidxScore || 0);

      if (hasUpdate) {
        // 楽曲情報を取得（読み取り専用）
        const song = await new Promise((resolve, reject) => {
          songdataDB.get(
            `SELECT title, artist, md5, sha256 FROM ${songdataTableName} WHERE sha256 = ?`,
            [row.sha256],
            (err, data) => err ? reject(err) : resolve(data)
          );
        });

        // 難易度表から情報を検索
        const tableInfo = findChartInTables(difficultyTables, song?.md5, row.sha256);

        // 更新内容を特定
        const updates = [];
        
        if (!previousBest || currentScore > (previousBest.score || 0)) {
          updates.push({
            type: 'score',
            old: previousBest?.score || 0,
            new: currentScore
          });
        }
        if (!previousBest || currentMinbp < (previousBest.minbp || 999999)) {
          updates.push({
            type: 'minbp',
            old: previousBest?.minbp || 999999,
            new: currentMinbp
          });
        }
        if (!previousBest || currentClear !== (previousBest.clear || 0)) {
          updates.push({
            type: 'clear',
            old: previousBest?.clear || 0,
            new: currentClear
          });
        }
        if (!previousBest || iidxScore.score > (previousBest.iidxScore || 0)) {
          updates.push({
            type: 'iidxScore',
            old: previousBest?.iidxScore || 0,
            new: iidxScore.score
          });
        }

        // 次のDJ LEVELまでの差分を計算
        const nextDjLevelPoints = calculateNextDjLevelPoints(iidxScore.score, iidxScore.maxScore);

        result.push({
          ...currentBest,
          ...song,
          score: currentScore,
          minbp: currentMinbp,
          clear: currentClear,
          clearTypeName: getClearTypeName(currentClear),
          iidxScore: iidxScore.score,
          iidxMaxScore: iidxScore.maxScore,
          djLevel: iidxScore.djLevel,
          nextDjLevelPoints,
          totalNotes: currentBest.notes || 0, // 総ノーツ数を明確に
          updates,
          playDate: row.date,
          // 難易度表情報
          tableSymbol: tableInfo?.symbol || '',
          tableLevel: tableInfo?.level || '',
          tableName: tableInfo?.table?.name || '',
          levelOrderIndex: tableInfo ? getLevelOrderIndex(tableInfo.level, tableInfo.levelOrder) : 999
        });

        // ローカルDBに記録を保存（アプリケーション側のデータのみ更新）
        await new Promise((resolve, reject) => {
          localDB.run(
            `INSERT OR REPLACE INTO score_history 
             (sha256, score, minbp, clear, date, iidxScore) VALUES (?, ?, ?, ?, ?, ?)`,
            [row.sha256, currentScore, currentMinbp, currentClear, start, iidxScore.score],
            (err) => err ? reject(err) : resolve()
          );
        });

        // 更新記録も保存（アプリケーション側のデータのみ更新）
        for (const update of updates) {
          await new Promise((resolve, reject) => {
            localDB.run(
              `INSERT INTO daily_updates 
               (sha256, play_date, update_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)`,
              [row.sha256, start, update.type, update.old, update.new],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }
    }

    // 難易度表の優先順位とレベル順でソート
    result.sort((a, b) => {
      // 1. 難易度表に含まれる楽曲を優先
      const aHasTable = a.tableSymbol !== '';
      const bHasTable = b.tableSymbol !== '';
      
      if (aHasTable && !bHasTable) return -1;
      if (!aHasTable && bHasTable) return 1;
      
      // 2. 難易度表内ではレベル順
      if (aHasTable && bHasTable) {
        return a.levelOrderIndex - b.levelOrderIndex;
      }
      
      // 3. 難易度表外では楽曲名順
      return (a.title || '').localeCompare(b.title || '');
    });

    console.log(`${result.length}件の更新が見つかりました`);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    // 全てのDBコネクションを安全に閉じる
    try {
      if (scorelogDB) {
        await new Promise((resolve) => {
          scorelogDB.close((err) => {
            if (err) console.error('scorelogDB close error:', err);
            resolve();
          });
        });
      }
      if (scoreDB) {
        await new Promise((resolve) => {
          scoreDB.close((err) => {
            if (err) console.error('scoreDB close error:', err);
            resolve();
          });
        });
      }
      if (songdataDB) {
        await new Promise((resolve) => {
          songdataDB.close((err) => {
            if (err) console.error('songdataDB close error:', err);
            resolve();
          });
        });
      }
      if (localDB) {
        await new Promise((resolve) => {
          localDB.close((err) => {
            if (err) console.error('localDB close error:', err);
            resolve();
          });
        });
      }
    } catch (closeError) {
      console.error('Error closing databases:', closeError);
    }
  }
});
        
        if (!previousBest || currentScore > (previousBest.score || 0)) {
          updates.push({
            type: 'score',
            old: previousBest?.score || 0,
            new: currentScore
          });
        }
        if (!previousBest || currentMinbp < (previousBest.minbp || 999999)) {
          updates.push({
            type: 'minbp',
            old: previousBest?.minbp || 999999,
            new: currentMinbp
          });
        }
        if (!previousBest || currentClear !== (previousBest.clear || 0)) {
          updates.push({
            type: 'clear',
            old: previousBest?.clear || 0,
            new: currentClear
          });
        }
        if (!previousBest || iidxScore.score > (previousBest.iidxScore || 0)) {
          updates.push({
            type: 'iidxScore',
            old: previousBest?.iidxScore || 0,
            new: iidxScore.score
          });
        }

        result.push({
          ...currentBest,
          ...song,
          score: currentScore,
          minbp: currentMinbp,
          clear: currentClear,
          clearTypeName: getClearTypeName(currentClear),
          iidxScore: iidxScore.score,
          iidxMaxScore: iidxScore.maxScore,
          djLevel: iidxScore.djLevel,
          totalNotes: currentBest.notes || 0, // 総ノーツ数を明確に
          updates,
          playDate: row.date
        });

        // ローカルDBに記録を保存（アプリケーション側のデータのみ更新）
        await new Promise((resolve, reject) => {
          localDB.run(
            `INSERT OR REPLACE INTO score_history 
             (sha256, score, minbp, clear, date, iidxScore) VALUES (?, ?, ?, ?, ?, ?)`,
            [row.sha256, currentScore, currentMinbp, currentClear, start, iidxScore.score],
            (err) => err ? reject(err) : resolve()
          );
        });

        // 更新記録も保存（アプリケーション側のデータのみ更新）
        for (const update of updates) {
          await new Promise((resolve, reject) => {
            localDB.run(
              `INSERT INTO daily_updates 
               (sha256, play_date, update_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)`,
              [row.sha256, start, update.type, update.old, update.new],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }
    }

    // 難易度表の優先順位とレベル順でソート
    result.sort((a, b) => {
      // 1. 難易度表に含まれる楽曲を優先
      const aHasTable = a.tableSymbol !== '';
      const bHasTable = b.tableSymbol !== '';
      
      if (aHasTable && !bHasTable) return -1;
      if (!aHasTable && bHasTable) return 1;
      
      // 2. 難易度表内ではレベル順
      if (aHasTable && bHasTable) {
        return a.levelOrderIndex - b.levelOrderIndex;
      }
      
      // 3. 難易度表外では楽曲名順
      return (a.title || '').localeCompare(b.title || '');
    });

    console.log(`${result.length}件の更新が見つかりました`);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    // 全てのDBコネクションを安全に閉じる
    try {
      if (scorelogDB) {
        await new Promise((resolve) => {
          scorelogDB.close((err) => {
            if (err) console.error('scorelogDB close error:', err);
            resolve();
          });
        });
      }
      if (scoreDB) {
        await new Promise((resolve) => {
          scoreDB.close((err) => {
            if (err) console.error('scoreDB close error:', err);
            resolve();
          });
        });
      }
      if (songdataDB) {
        await new Promise((resolve) => {
          songdataDB.close((err) => {
            if (err) console.error('songdataDB close error:', err);
            resolve();
          });
        });
      }
      if (localDB) {
        await new Promise((resolve) => {
          localDB.close((err) => {
            if (err) console.error('localDB close error:', err);
            resolve();
          });
        });
      }
    } catch (closeError) {
      console.error('Error closing databases:', closeError);
    }
  }
});
