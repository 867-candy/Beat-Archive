const Database = require('better-sqlite3');

console.log('=== songdataテーブルにA.S.D.F [EX]楽曲情報を追加 ===');

// 実際のA.S.D.F [EX]のSHA256
const sha256 = '3244a453f9f6018e12bf13e30181c5c58ff9942d0690a2c626557442c7295eaa';

const db = new Database('./sample-db/songdata.db');

// 既存のA.S.D.F [EX]データを削除
console.log('既存データをクリア中...');
const deleteStmt = db.prepare('DELETE FROM song WHERE sha256 = ?');
const deletedCount = deleteStmt.run(sha256).changes;
console.log(`削除されたレコード数: ${deletedCount}`);

// A.S.D.F [EX]の楽曲情報を追加
console.log('A.S.D.F [EX]楽曲情報を追加中...');

const insertStmt = db.prepare(`
  INSERT INTO song (title, artist, sha256, md5, notes)
  VALUES (?, ?, ?, ?, ?)
`);

insertStmt.run(
  'A.S.D.F [EX]',                                              // title
  'kors k',                                                    // artist  
  sha256,                                                      // sha256
  'md5_placeholder_for_asdf',                                  // md5
  1677                                                         // notes
);

console.log('✅ A.S.D.F [EX]楽曲情報追加完了');

// 追加されたデータを確認
const result = db.prepare('SELECT * FROM song WHERE sha256 = ?').get(sha256);
if (result) {
  console.log('追加された楽曲情報:');
  console.log(`  タイトル: ${result.title}`);
  console.log(`  アーティスト: ${result.artist}`);
  console.log(`  SHA256: ${result.sha256.substring(0, 16)}...`);
  console.log(`  ノーツ数: ${result.notes}`);
} else {
  console.log('❌ 楽曲情報の追加に失敗しました');
}

db.close();

console.log('\n次のステップ: scoredatalogテストデータも作成してください。');
