const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

const songdataPath = path.join(__dirname, 'sample-db', 'songdata.db');
const scorelogPath = path.join(__dirname, 'sample-db', 'scorelog.db');
const scorePath = path.join(__dirname, 'sample-db', 'score.db');
const localDbPath = path.join(__dirname, 'local-data.db');

const songdataDb = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);
const scorelogDb = new sqlite3.Database(scorelogPath, sqlite3.OPEN_READONLY);
const scoreDb = new sqlite3.Database(scorePath, sqlite3.OPEN_READONLY);
const localDb = new sqlite3.Database(localDbPath);

const targetDate = dayjs('2025-08-04');
const start = targetDate.startOf('day').unix();
const end = targetDate.endOf('day').unix();
const previousDay = targetDate.subtract(1, 'day').endOf('day').unix();

console.log('=== 更新判定詳細分析 ===');

// その日のプレイログを取得
scorelogDb.all(`SELECT * FROM scorelog WHERE date BETWEEN ? AND ? ORDER BY date ASC`, [start, end], async (err, logs) => {
  if (err) {
    console.error('プレイログクエリエラー:', err);
    return;
  }
  
  console.log(`プレイログ総数: ${logs.length}`);
  
  const processedSongs = new Set();
  const updatedSongs = [];
  const notUpdatedSongs = [];
  
  for (const row of logs) {
    // 重複チェック
    if (processedSongs.has(row.sha256)) {
      continue;
    }
    processedSongs.add(row.sha256);
    
    // 楽曲情報を取得
    const song = await new Promise((resolve, reject) => {
      songdataDb.get(`SELECT title, notes FROM song WHERE sha256 = ?`, [row.sha256], (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    
    if (!song) {
      console.log(`楽曲データなし: ${row.sha256}`);
      continue;
    }
    
    // 現在のスコアを取得
    const currentBest = await new Promise((resolve, reject) => {
      scoreDb.get(`SELECT * FROM score WHERE sha256 = ?`, [row.sha256], (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    
    if (!currentBest) {
      console.log(`スコアデータなし: ${song.title}`);
      continue;
    }
    
    // 前日以前の記録を取得
    const previousBest = await new Promise((resolve, reject) => {
      localDb.get(`SELECT * FROM score_history WHERE sha256 = ? AND date <= ? ORDER BY date DESC LIMIT 1`, [row.sha256, previousDay], (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    
    // スコア計算
    const currentScore = calculateScore(currentBest);
    const currentMinbp = currentBest.minbp || 999999;
    const currentClear = currentBest.clear || 0;
    const iidxScore = calculateIIDXScore(currentBest);
    
    // 更新判定
    const hasUpdate = !previousBest || 
      currentScore > (previousBest.score || 0) ||
      currentMinbp < (previousBest.minbp || 999999) ||
      currentClear !== (previousBest.clear || 0) ||
      iidxScore.score > (previousBest.iidxScore || 0);
    
    const songInfo = {
      title: song.title,
      notes: song.notes,
      currentScore: currentScore,
      currentMinbp: currentMinbp,
      currentClear: currentClear,
      iidxScore: iidxScore.score,
      previousBest: previousBest,
      hasUpdate: hasUpdate
    };
    
    if (hasUpdate) {
      updatedSongs.push(songInfo);
    } else {
      notUpdatedSongs.push(songInfo);
    }
  }
  
  console.log(`\n更新された楽曲: ${updatedSongs.length}曲`);
  console.log(`更新されなかった楽曲: ${notUpdatedSongs.length}曲`);
  
  const updatedTotalNotes = updatedSongs.reduce((sum, song) => sum + song.notes, 0);
  const notUpdatedTotalNotes = notUpdatedSongs.reduce((sum, song) => sum + song.notes, 0);
  
  console.log(`\n更新楽曲の総ノーツ数: ${updatedTotalNotes}`);
  console.log(`非更新楽曲の総ノーツ数: ${notUpdatedTotalNotes}`);
  console.log(`全体の総ノーツ数: ${updatedTotalNotes + notUpdatedTotalNotes}`);
  
  console.log('\n=== 更新されなかった楽曲一覧 ===');
  notUpdatedSongs.forEach((song, index) => {
    console.log(`${index + 1}. ${song.title} (${song.notes}ノーツ) - 前回記録あり: ${!!song.previousBest}`);
  });
  
  // データベースを閉じる
  songdataDb.close();
  scorelogDb.close();
  scoreDb.close();
  localDb.close();
});

// スコア計算関数（main.jsと同じ）
function calculateScore(scoreData) {
  if (!scoreData) return 0;
  
  const { epg = 0, lpg = 0, egr = 0, lgr = 0, egd = 0, lgd = 0, notes = 0 } = scoreData;
  
  if (notes === 0) return 0;
  
  const totalScore = (epg * 2 + lpg * 2 + egr * 1 + lgr * 1);
  const maxScore = notes * 2;
  
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

function calculateIIDXScore(scoreData) {
  if (!scoreData) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  const { epg = 0, lpg = 0, egr = 0, lgr = 0, notes = 0 } = scoreData;
  
  if (notes === 0) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  const score = (epg + lpg) * 2 + (egr + lgr) * 1;
  const maxScore = notes * 2;
  
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
