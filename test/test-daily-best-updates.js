const path = require('path');
const dayjs = require('dayjs');

// main.jsから calculateDailyBestUpdates 関数をインポートするためのテストファイル
// A.S.D.F [EX]の例を実際のデータベースに適用してテスト

// main.jsのcalculateDailyBestUpdates関数を模倣
function testDailyBestUpdates(targetDateStr = '2025-08-04') {
  console.log(`=== ${targetDateStr} の差分計算テスト ===`);
  
  // テストデータ: A.S.D.F [EX]風のデータ
  const testSongs = [
    {
      sha256: 'test_asdf_ex_hash',
      songTitle: 'A.S.D.F [EX]',
      // 前日までのベスト（8/3まで）
      previousBest: {
        exscore: 2012,
        minbp: 25,
        clear: 3  // HARD CLEAR
      },
      // 当日のベスト（8/4）
      todayBest: {
        exscore: 2052,
        minbp: 20,
        clear: 4  // EX HARD CLEAR
      }
    },
    {
      sha256: 'test_hard_song_hash',
      songTitle: 'Test Song [HARD]',
      // 前日までのベスト
      previousBest: {
        exscore: 3250,
        minbp: 15,
        clear: 4
      },
      // 当日のベスト
      todayBest: {
        exscore: 3280,
        minbp: 12,
        clear: 4
      }
    }
  ];
  
  testSongs.forEach((song, index) => {
    console.log(`\\n--- 楽曲 ${index + 1}: ${song.songTitle} ---`);
    
    const updates = [];
    const sha256 = song.sha256;
    const previousBest = song.previousBest;
    const todayBest = song.todayBest;
    
    const previousScore = previousBest.exscore;
    const todayScore = todayBest.exscore;
    
    console.log(`前日までのベスト: スコア=${previousScore}, MISS=${previousBest.minbp}, クリア=${previousBest.clear}`);
    console.log(`当日のベスト: スコア=${todayScore}, MISS=${todayBest.minbp}, クリア=${todayBest.clear}`);
    
    // 1. スコア差分比較（改善のみ表示）
    if (todayScore > previousScore) {
      updates.push({
        type: 'daily_score',
        old: previousScore,
        new: todayScore,
        improvement: todayScore - previousScore
      });
      console.log(`✓ スコア改善検出: +${todayScore - previousScore}`);
    }
    
    // 2. MISS数差分比較（改善のみ表示）
    if (todayBest.minbp < previousBest.minbp && todayBest.minbp < 999999 && previousBest.minbp < 999999) {
      updates.push({
        type: 'daily_miss',
        old: previousBest.minbp,
        new: todayBest.minbp,
        improvement: previousBest.minbp - todayBest.minbp
      });
      console.log(`✓ MISS改善検出: -${previousBest.minbp - todayBest.minbp}`);
    }
    
    // 3. クリア差分比較（改善のみ表示）
    if (todayBest.clear > previousBest.clear) {
      updates.push({
        type: 'daily_clear',
        old: previousBest.clear,
        new: todayBest.clear
      });
      console.log(`✓ クリア改善検出: ${previousBest.clear} → ${todayBest.clear}`);
    }
    
    // 4. ランク差分計算用データを追加
    updates.push({
      type: 'daily_rank_info',
      previousScore: previousScore,
      todayScore: todayScore
    });
    
    console.log(`\\n[フロントエンド送信データ]`);
    updates.forEach((update, i) => {
      console.log(`${i + 1}. ${JSON.stringify(update, null, 2)}`);
    });
    
    // フロントエンドでの表示シミュレーション
    console.log(`\\n[フロントエンド表示結果]`);
    const scoreDisplay = formatScoreDiff(updates, todayScore);
    const missDisplay = formatMissDiff(updates, todayBest.minbp);
    const clearDisplay = formatClearDiff(updates, todayBest.clear);
    
    console.log(`スコア: ${scoreDisplay}`);
    console.log(`MISS: ${missDisplay}`);
    console.log(`クリア: ${clearDisplay}`);
  });
}

// renderer.jsの表示関数を模倣
function formatScoreDiff(updates, currentScore) {
  const dailyScoreUpdate = updates.find(u => u.type === 'daily_score');
  
  if (dailyScoreUpdate) {
    return `${currentScore} +${dailyScoreUpdate.improvement}`;
  }
  
  return currentScore;
}

function formatMissDiff(updates, currentMiss) {
  const dailyMissUpdate = updates.find(u => u.type === 'daily_miss');
  
  if (dailyMissUpdate) {
    return `${currentMiss} -${dailyMissUpdate.improvement}`;
  }
  
  return currentMiss;
}

function formatClearDiff(updates, currentClear) {
  const dailyClearUpdate = updates.find(u => u.type === 'daily_clear');
  
  if (dailyClearUpdate) {
    const clearTypes = ['NO PLAY', 'FAILED', 'ASSIST', 'LIGHT', 'HARD', 'EX HARD', 'FULL COMBO'];
    const oldClear = clearTypes[dailyClearUpdate.old] || 'UNKNOWN';
    const newClear = clearTypes[dailyClearUpdate.new] || 'UNKNOWN';
    return `${oldClear} → ${newClear}`;
  }
  
  return currentClear;
}

// テスト実行
testDailyBestUpdates('2025-08-04');
