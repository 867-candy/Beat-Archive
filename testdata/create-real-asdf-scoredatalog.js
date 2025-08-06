const Database = require('better-sqlite3');
const path = require('path');

// 正しいA.S.D.F [EX]のSHA256
const realSHA256 = '3244a453f9f6018e12bf13e30181c5c58ff9942d0690a2c626557442c7295eaa';

// データベースファイルのパス
const scoredatalogPath = path.join(__dirname, '..', 'sample-db', 'scoredatalog.db');

try {
  const db = new Database(scoredatalogPath);
  
  console.log('A.S.D.F [EX]のscoredatalogテストデータ作成開始...');
  
  // テーブル構造確認
  const tableInfo = db.prepare('PRAGMA table_info(scoredatalog)').all();
  console.log('scoredatalogテーブル構造:');
  tableInfo.forEach(col => console.log(`  ${col.name}: ${col.type}`));
  
  // 8/3のテスト記録（ベスト: 2012）
  const date1 = Math.floor(new Date('2025-08-03T10:30:00').getTime() / 1000);
  
  // 8/4のテスト記録（改善: 2052, +40の差分）
  const date2 = Math.floor(new Date('2025-08-04T14:20:00').getTime() / 1000);
  
  // 既存の正しいSHA256の記録をすべて削除
  db.prepare('DELETE FROM scoredatalog WHERE sha256 = ?').run(realSHA256);
  console.log('既存の正しいSHA256データを削除しました');
  
  // 正しいSHA256でのテストデータを挿入
  const insertStmt = db.prepare(`
    INSERT INTO scoredatalog (
      sha256, mode, clear, epg, lpg, egr, lgr, egd, lgd, ebd, lbd, 
      epr, lpr, ems, lms, notes, combo, minbp, avgjudge, playcount, 
      clearcount, trophy, ghost, option, seed, random, date, state, scorehash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // 8/3の記録 (EPG=800, LPG=200, EGR=12, LGR=0 → EXScore = 2012)
  insertStmt.run([
    realSHA256,    // sha256
    1,             // mode (1=EX)
    2,             // clear (2=HARD CLEAR)
    800,           // epg
    200,           // lpg  
    12,            // egr
    0,             // lgr
    0,             // egd
    0,             // lgd
    0,             // ebd
    0,             // lbd
    0,             // epr
    0,             // lpr
    0,             // ems
    0,             // lms
    1677,          // notes
    1677,          // combo
    0,             // minbp (MISS数)
    83,            // avgjudge
    1,             // playcount
    1,             // clearcount
    '',            // trophy
    '',            // ghost
    0,             // option
    0,             // seed
    0,             // random
    date1,         // date (Unixタイムスタンプ)
    0,             // state
    'test_hash_1'  // scorehash
  ]);
  
  // 8/4の記録 (EPG=820, LPG=200, EGR=12, LGR=0 → EXScore = 2052, +40改善)
  // 異なるscorehashで別レコードとして挿入
  insertStmt.run([
    realSHA256,    // sha256
    2,             // mode (2=ANOTHER, 主キー制約回避)
    2,             // clear (2=HARD CLEAR)
    820,           // epg (+20改善)
    200,           // lpg
    12,            // egr
    0,             // lgr
    0,             // egd
    0,             // lgd
    0,             // ebd
    0,             // lbd
    0,             // epr
    0,             // lpr
    0,             // ems
    0,             // lms
    1677,          // notes
    1677,          // combo
    0,             // minbp (MISS数)
    85,            // avgjudge (改善)
    1,             // playcount
    1,             // clearcount
    '',            // trophy
    '',            // ghost
    0,             // option
    0,             // seed
    0,             // random
    date2,         // date (Unixタイムスタンプ)
    0,             // state
    'test_hash_2'  // scorehash
  ]);
  
  console.log('テストデータを挿入しました:');
  console.log(`  8/3: EXScore=2012 (EPG=800, LPG=200, EGR=12)`);
  console.log(`  8/4: EXScore=2052 (EPG=820, LPG=200, EGR=12) [+40改善]`);
  
  // 挿入結果を確認
  const verify = db.prepare(`
    SELECT date, epg, lpg, egr, lgr, 
           (epg + lpg) * 2 + (egr + lgr) as exscore 
    FROM scoredatalog 
    WHERE sha256 = ? 
    ORDER BY date
  `).all(realSHA256);
  
  console.log('\n挿入されたデータの確認:');
  verify.forEach(row => {
    const dateObj = new Date(row.date * 1000);
    console.log(`  ${dateObj.toLocaleString('ja-JP')}: EXScore=${row.exscore}`);
  });
  
  db.close();
  console.log('\nA.S.D.F [EX]のscoredatalogテストデータ作成完了');
  
} catch (error) {
  console.error('エラーが発生しました:', error);
  process.exit(1);
}
