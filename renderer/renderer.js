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
  
  return colorMap[clearTypeName] || '#e74c3c'; // デフォルト色
}

// 楽曲タイトルとサブタイトルを適切にフォーマットする関数
function formatSongTitle(song) {
  if (!song.title || song.title.trim() === '') {
    return '[Unknown Song]';
  }
  let title = song.title;
  if (song.subtitle && song.subtitle.trim() !== '') {
    title += ` ${song.subtitle}`;
  }
  // 60文字で打ち切り
  if (title.length > 60) {
    title = title.substring(0, 60) + '...';
  }
  return title;
}

async function init() {
  console.log('=== [デバッグ] 初期化処理を開始します ===');
  const config = await window.api.getConfig();
  Object.assign(state.dbPaths, config.dbPaths);
  
  // 今日の日付をデフォルトで設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateInput').value = today;
  console.log(`[デバッグ] 初期化完了 - 日付設定: ${today}`);
  
  // スマートビューボタンのイベントリスナーを設定
  const smartviewBtn = document.getElementById('smartviewBtn');
  if (smartviewBtn) {
    smartviewBtn.addEventListener('click', async () => {
      try {
        await window.api.smartViewWindow();
      } catch (error) {
        console.error('Error opening smart view:', error);
      }
    });
  }
}

document.getElementById('loadBtn').addEventListener('click', async () => {
  console.log('=== [デバッグ] 読み込みボタンがクリックされました ===');
  
  const date = document.getElementById('dateInput').value;
  const list = document.getElementById('songList');
  
  if (!date) {
    console.log('[デバッグ] 日付が選択されていません');
    list.innerHTML = '<li class="no-results">日付を選択してください</li>';
    return;
  }
  
  console.log(`[デバッグ] 日付: ${date} のデータを読み込み中...`);
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
          // MISS改善表示（diffは負の値で保存されている）
          return `${currentValue} <span style="color: #e74c3c; font-weight: bold;">${missUpdate.diff}</span>`;
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
          ${tableDisplay} ${formatSongTitle(song)}
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
    
    // Smart View用の統計情報を保存
    const smartViewStats = {
      selectedDate: date, // 選択された日付を追加
      totalNotesPlayed: totalNotesPlayed,
      displayTotalNotes: displayTotalNotes,
      displayedSongsCount: displayedSongsCount,
      hiddenSongsCount: hiddenSongsCount,
      unknownSongsCount: unknownSongsCount,
      djLevelCounts: djLevelCounts,
      clearLampCounts: clearLampCounts,
      totalMissCount: totalMissCount,
      lastUpdated: new Date().toISOString(),
      songData: data // 楽曲データも含める
    };
    
    // ファイルに保存（Smart View用）
    window.api.saveSmartViewStats(smartViewStats);
    
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
    statsElement.style.marginBottom = '30px';
    statsElement.style.marginTop = '30px';
    statsElement.style.fontSize = '1.3rem';
    
    let statsHtml = `
      <div style="color: #27ae60; font-size: 1.3rem;">📊 ${date}のプレイ統計</div>
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

// スクリーンショット機能
document.getElementById('screenshotBtn').addEventListener('click', async () => {
  console.log('=== [デバッグ] スクリーンショットボタンがクリックされました ===');
  
  const date = document.getElementById('dateInput').value;
  if (!date) {
    console.log('[デバッグ] 日付が選択されていません');
    alert('日付を選択してください');
    return;
  }
  
  const songList = document.getElementById('songList');
  if (songList.children.length === 0 || songList.querySelector('.no-results, .loading')) {
    console.log('[デバッグ] 楽曲データが読み込まれていません');
    alert('楽曲データを読み込んでからスクリーンショットを撮影してください');
    return;
  }
  
  try {
    console.log('[デバッグ] ディレクトリ選択ダイアログを開きます');
    // ディレクトリ選択ダイアログを開く
    const directory = await window.api.selectDirectory();
    if (!directory) {
      console.log('[デバッグ] ディレクトリ選択がキャンセルされました');
      return; // ユーザーがキャンセルした場合
    }
    
    console.log(`[デバッグ] 選択されたディレクトリ: ${directory}`);
    console.log('スクロール＋合成スクリーンショットを撮影中...');
    
    // section2の位置を取得
    const section2 = document.querySelector('div.section2');
    if (!section2) {
      console.error('[デバッグ] section2要素が見つかりません');
      return;
    }
    
    console.log('[デバッグ] section2要素が見つかりました');
    
    // ページとビューポートの情報を取得
    const totalPageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const viewportHeight = window.innerHeight;
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const maxScrollTop = totalPageHeight - viewportHeight;
    
    // section2の位置情報を取得
    const section2Rect = section2.getBoundingClientRect();
    const section2Top = section2Rect.top + currentScrollTop;
    const section2Bottom = section2Top + section2Rect.height;
    
    console.log(`ページ情報: 総高さ=${totalPageHeight}, ビューポート=${viewportHeight}, 最大スクロール=${maxScrollTop}`);
    console.log(`section2情報: top=${section2Top}, bottom=${section2Bottom}, height=${section2Rect.height}`);
    console.log(`現在のスクロール位置: ${currentScrollTop}`);
    
    // スクロールが可能かどうか判定
    const canScroll = totalPageHeight > viewportHeight;
    console.log(`スクロール可能: ${canScroll}`);
    
    if (canScroll) {
      // スクロールが可能な場合：section2が見える位置にスクロール
      const targetScrollY = Math.max(0, Math.min(section2Top - 50, maxScrollTop));
      console.log(`スクロール先: ${targetScrollY}`);
      window.scrollTo(0, targetScrollY);
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // スクロールが不要な場合：現在の位置のまま
      console.log('ページが短いためスクロール不要');
    }
    
    // ページの高さに応じて動的にセグメント数を決定
    const section2Height = section2Rect.height;
    
    // 理想的なセグメント数を計算（1セグメントあたり画面の1.2〜1.5倍の高さを目安）
    const idealSegmentHeight = Math.floor(viewportHeight * 1.3); // 画面高さの1.3倍
    let targetSegments = Math.ceil(section2Height / idealSegmentHeight);
    
    // セグメント数の範囲を制限（1〜12個）
    targetSegments = Math.max(1, Math.min(targetSegments, 12));
    
    // 実際のセグメント高さを計算
    const actualSegmentHeight = Math.ceil(section2Height / targetSegments);
    const maxSegmentHeight = actualSegmentHeight + 100; // 少し余裕を持たせる
    
    console.log(`動的セグメント計算: section2Height=${section2Height}px, viewportHeight=${viewportHeight}px`);
    console.log(`理想セグメント高さ=${idealSegmentHeight}px, 目標セグメント数=${targetSegments}個`);
    console.log(`実際セグメント高さ=${actualSegmentHeight}px, maxSegmentHeight=${maxSegmentHeight}px`);
    
    // section2の範囲でスクリーンショット
    const x = 0;
    const y = 0; // ページ全体をキャプチャしてから切り抜く
    const width = document.documentElement.clientWidth;
    const height = totalPageHeight;
    const bounds = { x, y, width, height };
    console.log(`[デバッグ] スクリーンショット実行開始 - bounds:`, bounds);
    const result = await window.api.takeScrollingScreenshot(directory, date, maxSegmentHeight, bounds);
    console.log(`[デバッグ] スクリーンショット実行完了 - result:`, result);
    
    if (result.success) {
      let message = '';
      let compressedImagePath = null;
      
      if (result.files.length === 1) {
        message = `スクリーンショットを保存しました（${result.method}）:\n${result.files[0]}`;
        // compressed版があるかチェック
        const originalPath = result.files[0];
        const compressedPath = originalPath.replace(/(\.[^.]+)$/, '_compressed$1');
        console.log(`[スクリーンショット] 元画像パス: ${originalPath}`);
        console.log(`[スクリーンショット] compressed画像パス候補: ${compressedPath}`);
        
        try {
          const compressedExists = await window.api.fileExists(compressedPath);
          console.log(`[スクリーンショット] compressed画像存在確認: ${compressedExists ? '存在' : '不存在'}`);
          
          if (compressedExists) {
            compressedImagePath = compressedPath;
            console.log(`[スクリーンショット] ✅ compressed画像を使用: ${compressedImagePath}`);
          } else {
            compressedImagePath = originalPath;
            console.log(`[スクリーンショット] ⚠️ compressed画像なし、元画像を使用: ${compressedImagePath}`);
          }
        } catch (e) {
          console.warn(`[スクリーンショット] ❌ compressed画像確認でエラー: ${e}`);
          compressedImagePath = originalPath;
          console.log(`[スクリーンショット] エラー時代替: 元画像を使用: ${compressedImagePath}`);
        }
      } else {
        message = `分割スクリーンショット（${result.files.length}個、${result.method}）を保存しました:\n${result.files.join('\n')}`;
        // 最初のファイルのcompressed版を使用
        const originalPath = result.files[0];
        const compressedPath = originalPath.replace(/(\.[^.]+)$/, '_compressed$1');
        console.log(`[分割スクリーンショット] 元画像パス（最初）: ${originalPath}`);
        console.log(`[分割スクリーンショット] compressed画像パス候補: ${compressedPath}`);
        
        try {
          const compressedExists = await window.api.fileExists(compressedPath);
          console.log(`[分割スクリーンショット] compressed画像存在確認: ${compressedExists ? '存在' : '不存在'}`);
          
          if (compressedExists) {
            compressedImagePath = compressedPath;
            console.log(`[分割スクリーンショット] ✅ compressed画像を使用: ${compressedImagePath}`);
          } else {
            compressedImagePath = originalPath;
            console.log(`[分割スクリーンショット] ⚠️ compressed画像なし、元画像を使用: ${compressedImagePath}`);
          }
        } catch (e) {
          console.warn(`[分割スクリーンショット] ❌ compressed画像確認でエラー: ${e}`);
          compressedImagePath = originalPath;
          console.log(`[分割スクリーンショット] エラー時代替: 元画像を使用: ${compressedImagePath}`);
        }
      }
      
      // スクリーンショット完了メッセージを表示
      alert(message);
      
      // 最後のスクリーンショットパスをconfig に保存
      if (compressedImagePath) {
        console.log(`[デバッグ] 最後のスクリーンショットパスを保存: ${compressedImagePath}`);
        try {
          await window.api.updateLastScreenshotPath(compressedImagePath, directory);
          console.log(`[デバッグ] スクリーンショットパス保存成功`);
        } catch (updateError) {
          console.error(`[デバッグ] スクリーンショットパス保存エラー:`, updateError);
        }
      }
    } else {
      alert(`スクリーンショットの撮影中にエラーが発生しました: ${result.error}`);
    }
    
  } catch (error) {
    console.error('スクリーンショットエラー:', error);
    alert(`スクリーンショットの保存中にエラーが発生しました: ${error.message}`);
  }
});

// Twitter投稿用のテキストを生成する関数
function generateTwitterText(date, stats, clearLampCounts, djLevelCounts) {
  const displayedSongsCount = stats?.displayedSongsCount || 0;
  const hiddenSongsCount = stats?.hiddenSongs || 0;
  const unknownSongsCount = stats?.unknownSongs || 0;
  const displayTotalNotes = stats?.totalNotes || 0;

  // ランク分布の文字列を作成（上位のみ表示）
  const djLevelDisplay = Object.entries(djLevelCounts)
    .filter(([level, count]) => count > 0)
    .slice(0, 5) // 上位5つまで
    .map(([level, count]) => `${level}:${count}`)
    .join(' ');

  // ランプ分布の文字列を作成（重要なクリアのみ表示）
  const clearLampOrder = ['FULL COMBO', 'EX HARD CLEAR', 'HARD CLEAR', 'CLEAR', 'EASY CLEAR'];
  const clearLampDisplay = clearLampOrder
    .filter(clearType => clearLampCounts[clearType] > 0)
    .slice(0, 4) // 上位4つまで
    .map(clearType => {
      const shortNames = {
        'FULL COMBO': 'FC',
        'EX HARD CLEAR': 'EXH',
        'HARD CLEAR': 'HARD',
        'CLEAR': 'CLEAR',
        'EASY CLEAR': 'EASY'
      };
      return `${shortNames[clearType]}:${clearLampCounts[clearType]}`;
    })
    .join(' ');

  // Twitter投稿用テキストを生成
  let twitterText = `📊 ${date}のプレイ記録\n\n`;
  twitterText += `🎵更新楽曲数: ${displayedSongsCount}曲`;
  
  if (hiddenSongsCount > 0 || unknownSongsCount > 0) {
    let hiddenInfo = [];
    if (hiddenSongsCount > 0) hiddenInfo.push(`統合: +${hiddenSongsCount}曲`);
    if (unknownSongsCount > 0) hiddenInfo.push(`Unknown: +${unknownSongsCount}曲`);
    twitterText += ` (${hiddenInfo.join(', ')})`;
  }
  
  twitterText += `\n🎹総ノーツ数: ${displayTotalNotes.toLocaleString()}ノーツ`;
  
  if (djLevelDisplay) {
    twitterText += `\n🏆ランク分布: ${djLevelDisplay}`;
  }
  
  if (clearLampDisplay) {
    twitterText += `\n💡ランプ分布: ${clearLampDisplay}`;
  }
  
  twitterText += `\n\n#BeatArchive`;
  
  return twitterText;
}

// Twitter投稿機能
document.getElementById('twitterBtn').addEventListener('click', async () => {
  console.log('=== [デバッグ] Twitter投稿ボタンがクリックされました ===');
  
  const date = document.getElementById('dateInput').value;
  if (!date) {
    console.log('[デバッグ] 日付が選択されていません');
    alert('日付を選択してください');
    return;
  }
  
  const songList = document.getElementById('songList');
  if (songList.children.length === 0 || songList.querySelector('.no-results, .loading')) {
    console.log('[デバッグ] 楽曲データが読み込まれていません');
    alert('楽曲データを読み込んでからX投稿を行ってください');
    return;
  }
  
  console.log('[デバッグ] Twitter投稿処理を開始します');
  
  try {
    // 最新の統計データを取得
    const response = await window.api.getUpdatedSongs(date);
    const data = response.songs || response;
    const stats = response.stats || null;
    
    if (data.length === 0) {
      alert('この日に更新された譜面がないため、X投稿できません');
      return;
    }
    
    // 統計データを再計算
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
      const djLevel = song.djLevel || 'F';
      const clearTypeName = song.clearTypeName || 'UNKNOWN';
      
      if (djLevelCounts.hasOwnProperty(djLevel)) {
        djLevelCounts[djLevel]++;
      }
      if (clearLampCounts.hasOwnProperty(clearTypeName)) {
        clearLampCounts[clearTypeName]++;
      }
    }
    
    // 統計情報を統合
    const displayedSongsCount = data.length;
    const hiddenSongsCount = stats ? stats.hiddenSongs : 0;
    const unknownSongsCount = stats ? stats.unknownSongs : 0;
    const displayTotalNotes = stats && stats.totalNotes ? stats.totalNotes : 0;
    
    const statsForTwitter = {
      displayedSongsCount,
      hiddenSongs: hiddenSongsCount,
      unknownSongs: unknownSongsCount,
      totalNotes: displayTotalNotes
    };
    
    // Twitter投稿用テキストを生成
    const twitterText = generateTwitterText(date, statsForTwitter, clearLampCounts, djLevelCounts);
    
    console.log('Twitter投稿用テキスト:', twitterText);
    
    // スクリーンショットのディレクトリを開く処理
    try {
      console.log(`[デバッグ] 最後のスクリーンショット情報を取得中...`);
      const lastScreenshot = await window.api.getLastScreenshotPath();
      console.log(`[Twitter投稿] 最後のスクリーンショット情報:`, lastScreenshot);
      
      if (lastScreenshot.directory) {
        console.log(`[Twitter投稿] スクリーンショットディレクトリを開きます: ${lastScreenshot.directory}`);
        
        const openResult = await window.api.openDirectory(lastScreenshot.directory);
        
        if (openResult.success) {
          console.log(`[Twitter投稿] ✅ ディレクトリを正常に開きました: ${lastScreenshot.directory}`);
        } else {
          console.warn(`[Twitter投稿] ❌ ディレクトリを開くことができませんでした: ${openResult.error}`);
        }
      } else {
        console.log(`[Twitter投稿] ⚠️ スクリーンショットディレクトリが見つかりません`);
      }
    } catch (e) {
      console.log(`[Twitter投稿] ⚠️ ディレクトリを開く処理でエラー: ${e.message}`);
    }
    
    // Twitterの投稿ページを開く
    const twitterResult = await window.api.openTwitterPost(twitterText);
    if (twitterResult.success) {
      const lastScreenshot = await window.api.getLastScreenshotPath();
      const hasDirectory = lastScreenshot.directory && lastScreenshot.directory !== '';
      
      console.log(`[Twitter投稿完了] 投稿ページ表示成功`);
      console.log(`[Twitter投稿完了] ディレクトリ情報: ${hasDirectory ? `利用可能 (${lastScreenshot.directory})` : '利用不可'}`);
      
      if (hasDirectory) {
        alert(`Xの投稿ページを開きました。\n\nスクリーンショットが保存されたフォルダを開いています。\n\n投稿文は既に入力されています。\n画像をドラッグ&ドロップまたは手動で添付してから投稿してください。\n\nフォルダパス: ${lastScreenshot.directory}`);
      } else {
        alert('Xの投稿ページを開きました。\n投稿文は既に入力されています。\n\n画像を添付したい場合は、先にスクリーンショットを撮影してから再度Xに投稿してください。');
      }
    } else {
      console.error(`[X投稿] ❌ 投稿ページ表示失敗: ${twitterResult.error}`);
      alert(`X投稿ページの表示に失敗しました: ${twitterResult.error}`);
    }
    
  } catch (error) {
    console.error('Twitter投稿エラー:', error);
    alert(`X投稿の準備中にエラーが発生しました: ${error.message}`);
  }
});

init();
