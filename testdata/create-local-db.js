const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ローカルデータベースの作成
function createLocalDatabase() {
  const dbPath = path.join(__dirname, 'local-data.db');
  
  // 既存のファイルを削除（開発時のみ）
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  const db = new sqlite3.Database(dbPath);
  
  // 楽曲の最高記録履歴テーブル
  db.serialize(() => {
    // 楽曲の最高記録スナップショット
    db.run(`
      CREATE TABLE IF NOT EXISTS score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sha256 TEXT NOT NULL,
        score INTEGER,
        minbp INTEGER,
        clear INTEGER,
        date INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(sha256, date)
      )
    `);
    
    // 日別の更新記録
    db.run(`
      CREATE TABLE IF NOT EXISTS daily_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sha256 TEXT NOT NULL,
        play_date INTEGER NOT NULL,
        update_type TEXT NOT NULL, -- 'score', 'minbp', 'clear'
        old_value INTEGER,
        new_value INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
    
    // 最後にチェックした日付
    db.run(`
      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY,
        last_sync_date INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
    
    console.log('ローカルデータベースを作成しました: local-data.db');
  });
  
  db.close();
}

// 実行
createLocalDatabase();
