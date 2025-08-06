const state = {
  dbPaths: {
    score: '',
    scorelog: '',
    songdata: ''
  }
};

// クリアタイプに応じた色を取得する関数
function getClearTypeColor(clearTypeName) {
  const colorMap = {
    'FAILED': '#CCCCCC',
    'ASSIST EASY CLEAR': '#FF66CC',
    'LIGHT ASSIST CLEAR': '#FF66CC',
    'EASY CLEAR': '#99FF99',
    'CLEAR': '#99CCFF',
    'HARD CLEAR': '#FF6666',
    'EX HARD CLEAR': '#FFFF99',
    'FULL COMBO': '#66E7F8',
    'PERFECT': '#85FAC0',
    'MAX': '#F3E8FF'
  };
  
  return colorMap[clearTypeName] || '#e74c3c'; // デフォルト色
}

async function init() {
  const config = await window.api.getConfig();
  Object.assign(state.dbPaths, config.dbPaths);
  
  // 今日の日付をデフォルトで設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateInput').value = today;
}

document.getElementById('loadBtn').addEventListener('click', async () => {
  const date = document.getElementById('dateInput').value;
  const list = document.getElementById('songList');
  
  if (!date) {
    list.innerHTML = '<li class="no-results">日付を選択してください</li>';
    return;
  }
  
  list.innerHTML = '<li class="loading">読み込み中...</li>';

  try {
    const response = await window.api.getUpdatedSongs(date);
    list.innerHTML = '';
    
    // 新しいデータ構造に対応
    const data = response.songs || response; // response.songsがある場合は新形式、ない場合は旧形式
    const stats = response.stats || null;
    
    // デバッグ情報
    console.log('Response stats:', stats);
    console.log('Data length:', data.length);
    if (stats) {
      console.log('Total notes from stats:', stats.totalNotes);
      console.log('Hidden songs:', stats.hiddenSongs);
    }
    
    if (data.length === 0) {
      list.innerHTML = '<li class="no-results">この日に更新された譜面はありません</li>';
      return;
    }
    
    // 統計用変数
    let totalNotesPlayed = 0;
    let totalSongsPlayed = data.length;
    let totalMissCount = 0;
    let djLevelCounts = { 'AAA': 0, 'AA': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0 };
    let clearLampCounts = { 
      'NO PLAY': 0, 
      'FAILED': 0, 
      'ASSIST EASY CLEAR': 0, 
      'LIGHT ASSIST CLEAR': 0, 
      'EASY CLEAR': 0, 
      'CLEAR': 0, 
      'HARD CLEAR': 0, 
      'EX HARD CLEAR': 0, 
      'FULL COMBO': 0,
      'PERFECT': 0,
      'MAX': 0
    };
    
    for (const song of data) {
      const li = document.createElement('li');
      
      // 表示用データを準備
      const beatorajaScore = song.score; // beatorajaの％スコア
      const iidxScore = song.iidxScore || 0; // IIDX仕様のSCORE
      const iidxMaxScore = song.iidxMaxScore || 0;
      const djLevel = song.djLevel || 'F';
      const totalNotes = song.totalNotes || 0;
      const missCount = song.minbp;
      const clearTypeName = song.clearTypeName || 'UNKNOWN';
      const nextDjLevelPoints = song.nextDjLevelPoints;
      const updates = song.updates || []; // 差分情報
      
      // 差分表示のヘルパー関数（scorelog.db ベース）
      function formatScoreDiff(updates, type, currentValue) {
        const scoreUpdate = updates.find(u => u.type === 'daily_score');
        const firstPlayUpdate = updates.find(u => u.type === 'daily_first_play');
        
        if (scoreUpdate) {
          // スコア改善表示
          return `${currentValue} <span style="color: #e74c3c; font-weight: bold;">+${scoreUpdate.diff}</span>`;
        }
        
        // 初回プレイの場合 - 差分表示なしでそのまま表示
        if (firstPlayUpdate) {
          return `${currentValue}`;
        }
        
        return currentValue;
      }
      
      function formatMissDiff(updates, currentValue) {
        const missUpdate = updates.find(u => u.type === 'daily_miss');
        const firstPlayUpdate = updates.find(u => u.type === 'daily_first_play');
        
        if (missUpdate) {
          // MISS改善表示
          return `${currentValue} <span style="color: #e74c3c; font-weight: bold;">-${missUpdate.diff}</span>`;
        }
        
        // 初回プレイの場合
        if (firstPlayUpdate) {
          return `${currentValue}`;
        }
        
        return currentValue;
      }
      
      function formatClearDiff(updates, currentValue) {
        const clearUpdate = updates.find(u => u.type === 'daily_clear');
        const firstPlayUpdate = updates.find(u => u.type === 'daily_first_play');
        
        if (clearUpdate) {
          // クリア改善表示
          return `${currentValue} <span style="color: #f39c12; font-weight: bold;">↑</span>`;
        }
        
        // 初回プレイの場合
        if (firstPlayUpdate) {
          return `${currentValue}`;
        }
        
        return currentValue;
      }
      
      function formatDjLevelDiff(updates, currentDjLevel) {
        const scoreUpdate = updates.find(u => u.type === 'daily_score');
        const firstPlayUpdate = updates.find(u => u.type === 'daily_first_play');
        
        if (scoreUpdate) {
          // DJ LEVELの順序
          const djLevels = ['F', 'E', 'D', 'C', 'B', 'A', 'AA', 'AAA'];
          
          // 前回のスコアから推定DJ LEVELを計算
          function getDjLevelFromScore(score, maxScore) {
            if (!maxScore || maxScore === 0) return 'F';
            const rate = score / maxScore;
            if (rate >= 8/9) return 'AAA';
            if (rate >= 7/9) return 'AA';
            if (rate >= 6/9) return 'A';
            if (rate >= 5/9) return 'B';
            if (rate >= 4/9) return 'C';
            if (rate >= 3/9) return 'D';
            if (rate >= 2/9) return 'E';
            return 'F';
          }
          
          const previousDjLevel = getDjLevelFromScore(scoreUpdate.oldValue, iidxMaxScore);
          
          if (previousDjLevel !== currentDjLevel) {
            return `<span style="color: #e74c3c;">${previousDjLevel} → ${currentDjLevel}</span>`;
          }
        }
        
        // 初回プレイの場合
        if (firstPlayUpdate) {
          return currentDjLevel;
        }
        
        return currentDjLevel;
      }
      
      function formatClearDiff(updates, currentClearName) {
        const clearUpdate = updates.find(u => u.type === 'daily_clear');
        const firstPlayUpdate = updates.find(u => u.type === 'daily_first_play');
        
        // クリアタイプマッピング
        const clearTypeMap = {
          0: 'NO PLAY',
          1: 'FAILED',
          2: 'ASSIST EASY CLEAR',
          3: 'LIGHT ASSIST CLEAR',
          4: 'EASY CLEAR',
          5: 'CLEAR',
          6: 'HARD CLEAR',
          7: 'EX HARD CLEAR',
          8: 'FULL COMBO',
          9: 'PERFECT',
          10: 'MAX'
        };
        
        // クリアタイプの色マッピング
        const clearColorMap = {
          'NO PLAY': '#CCCCCC',
          'FAILED': '#CCCCCC',
          'ASSIST EASY CLEAR': '#FF66CC',
          'LIGHT ASSIST CLEAR': '#FF66CC',
          'EASY CLEAR': '#99FF99',
          'CLEAR': '#99CCFF',
          'HARD CLEAR': '#FF6666',
          'EX HARD CLEAR': '#FFFF99',
          'FULL COMBO': '#66E7F8',
          'PERFECT': '#85FAC0',
          'MAX': '#F3E8FF'
        };
        
        // クリア改善がある場合
        if (clearUpdate) {
          const previousClearName = clearTypeMap[clearUpdate.oldValue] || 'UNKNOWN';
          const currentColor = clearColorMap[currentClearName] || '#CCCCCC';
          const previousColor = clearColorMap[previousClearName] || '#CCCCCC';
          return `<span style="background-color: ${previousColor}; color: #000000; padding: 2px 4px; border-radius: 3px;">${previousClearName}</span> <span style="color: #e74c3c; font-weight: bold;">→</span> <span style="background-color: ${currentColor}; color: #000000; padding: 2px 4px; border-radius: 3px;">${currentClearName}</span>`;
        }
        
        // 初回プレイの場合
        if (firstPlayUpdate) {
          const currentColor = clearColorMap[currentClearName] || '#CCCCCC';
          return `<span style="background-color: ${currentColor}; color: #000000; padding: 2px 4px; border-radius: 3px;">${currentClearName}</span>`;
        }
        
        const currentColor = clearColorMap[currentClearName] || '#CCCCCC';
        return `<span style="background-color: ${currentColor}; color: #000000; padding: 2px 4px; border-radius: 3px;">${currentClearName}</span>`;
      }
      
      // クリアタイプに応じた色を取得
      const clearColor = getClearTypeColor(clearTypeName);
      
      // liスタイルを設定（クリアタイプの色を適用）
      li.style.borderLeft = `4px solid ${clearColor}`;
      
      // 統計データに加算
      totalNotesPlayed += totalNotes;
      totalMissCount += missCount;
      
      // デバッグ用：各楽曲のノーツ数をログ出力（最初の3曲のみ）
      if (song.title && list.children.length <= 3) {
        console.log(`楽曲: ${song.title}, ノーツ数: ${totalNotes}`);
      }
      if (djLevelCounts.hasOwnProperty(djLevel)) {
        djLevelCounts[djLevel]++;
      }
      if (clearLampCounts.hasOwnProperty(clearTypeName)) {
        clearLampCounts[clearTypeName]++;
      }
      
      // 難易度表情報の表示（統合されたシンボル表示）
      const tableDisplay = song.tableSymbol ? song.tableSymbol : '';
      
      // 次のDJ LEVELまでの情報
      const nextLevelDisplay = nextDjLevelPoints && nextDjLevelPoints.nextLevel ? 
        ` | ${nextDjLevelPoints.nextLevel}まで: ${nextDjLevelPoints.pointsNeeded}点` : '';
      
      // 新しい表示形式で楽曲情報を表示
      li.innerHTML = `
        <div style="font-weight: bold; font-size: 1.1em;">
          ${tableDisplay} ${song.title || '[unknown]'}
        </div>
        <div style="margin-top: 5px; color: #2c3e50;">
          スコア: ${formatScoreDiff(updates, 'iidxScore', `${iidxScore}/${iidxMaxScore}`)} | ランク: ${formatDjLevelDiff(updates, djLevel)}${nextLevelDisplay} | MISS: ${formatMissDiff(updates, missCount)} | CLEAR: ${formatClearDiff(updates, clearTypeName)}
        </div>
        <div style="font-size: 0.9em; color: #666; margin-top: 3px;">
          総ノーツ: ${totalNotes} | スコアレート: ${beatorajaScore}%
        </div>
      `;
      list.appendChild(li);
    }
    
    // DJ LEVEL分布の文字列を作成
    const djLevelDisplay = Object.entries(djLevelCounts)
      .filter(([level, count]) => count > 0)
      .map(([level, count]) => `${level}:${count}`)
      .join(' | ');
    
    // クリアランプ分布の文字列を作成
    const clearLampOrder = ['FULL COMBO', 'EX HARD CLEAR', 'HARD CLEAR', 'CLEAR', 'EASY CLEAR', 'ASSIST EASY CLEAR', 'LIGHT ASSIST CLEAR', 'FAILED'];
    const clearLampDisplay = clearLampOrder
      .filter(clearType => clearLampCounts[clearType] > 0)
      .map(clearType => {
        // クリアタイプの短縮表示
        const shortNames = {
          'FULL COMBO': 'FC',
          'EX HARD CLEAR': 'EXH',
          'HARD CLEAR': 'HARD',
          'CLEAR': 'CLEAR',
          'EASY CLEAR': 'EASY',
          'ASSIST EASY CLEAR': 'ASSIST',
          'LIGHT ASSIST CLEAR': 'ASSIST',
          'FAILED': 'FAILED'
        };
        return `${shortNames[clearType]}:${clearLampCounts[clearType]}`;
      })
      .join(' | ');
    
    // 統計情報を表示（statsオブジェクトがある場合は新しい統計を使用）
    const displayTotalNotes = stats && stats.totalNotes ? stats.totalNotes : totalNotesPlayed; // サーバー統計を優先
    const displayedSongsCount = data.length; // 実際に表示されている楽曲数
    const hiddenSongsCount = stats ? stats.hiddenSongs : 0;
    const unknownSongsCount = stats ? stats.unknownSongs : 0;
    
    // デバッグ用ログ
    console.log('統計計算結果:', {
      totalNotesPlayed: totalNotesPlayed,
      displayTotalNotes: displayTotalNotes,
      statsFromServerTotalNotes: stats ? stats.totalNotes : 'なし',
      displayedSongsCount: displayedSongsCount,
      hiddenSongsCount: hiddenSongsCount,
      unknownSongsCount: unknownSongsCount,
      statsFromServer: stats
    });
    
    const statsElement = document.createElement('li');
    statsElement.style.background = '#e8f5e8';
    statsElement.style.borderLeft = '4px solid #27ae60';
    statsElement.style.fontWeight = 'bold';
    
    let statsHtml = `
      <div style="color: #27ae60; font-size: 16px;">📊 この日のプレイ統計</div>
      <div style="margin-top: 10px; line-height: 1.5;">
        🎵更新楽曲数: <span style="color: #2c3e50;">${displayedSongsCount}曲</span>`;
    
    if (hiddenSongsCount > 0 || unknownSongsCount > 0) {
      let hiddenInfo = [];
      if (hiddenSongsCount > 0) hiddenInfo.push(`統合: +${hiddenSongsCount}曲`);
      if (unknownSongsCount > 0) hiddenInfo.push(`Unknown: +${unknownSongsCount}曲`);
      statsHtml += ` <span style="color: #95a5a6; font-size: 0.9em;">(${hiddenInfo.join(', ')})</span>`;
    }
    
    statsHtml += `<br>
        🎹総ノーツ数: <span style="color: #2c3e50;">${displayTotalNotes.toLocaleString()}ノーツ</span><br>
        🏆️ランク分布: <span style="color: #2c3e50;">${djLevelDisplay || 'なし'}</span><br>
        💡ランプ分布: <span style="color: #2c3e50;">${clearLampDisplay || 'なし'}</span>
      </div>
    `;
    
    statsElement.innerHTML = statsHtml;
    list.insertBefore(statsElement, list.firstChild);
    
  } catch (e) {
    list.innerHTML = `<li style="color: #e74c3c; background: #fadbd8;">エラー: ${e.message}</li>`;
  }
});

init();
