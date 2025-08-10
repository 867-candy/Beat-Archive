// Smart View JavaScript

// ページネーション変数
let currentPage = 1;
const itemsPerPage = 10;
let filteredSongs = [];

// renderer.jsと同じクリアタイプから色を取得する関数（統一された色定義）
function getRendererClearTypeColor(clearTypeName) {
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
  
  return colorMap[clearTypeName] || '#e74c3c'; // デフォルト色（renderer.jsと同じ）
}

// クリアタイプ数値から名前への変換
function getClearTypeName(clearType) {
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
  return clearTypeMap[clearType] || 'FAILED';
}

// クリアタイプから色を取得する関数（統一された色定義）
function getClearTypeColor(clearType) {
  const clearTypeName = getClearTypeName(clearType);
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
  
  return colorMap[clearTypeName] || '#CCCCCC';
}

// クリアタイプに応じた色とクラスを取得する関数
function getClearLampInfo(clearType) {
  const lampMap = {
    0: { name: 'NO PLAY', color: '#666666', class: 'clear-lamp-failed' },
    1: { name: 'FAILED', color: '#CCCCCC', class: 'clear-lamp-failed' },
    2: { name: 'ASSIST EASY CLEAR', color: '#FF66CC', class: 'clear-lamp-assist' },
    3: { name: 'LIGHT ASSIST CLEAR', color: '#FF66CC', class: 'clear-lamp-assist' },
    4: { name: 'EASY CLEAR', color: '#99FF99', class: 'clear-lamp-easy' },
    5: { name: 'CLEAR', color: '#99CCFF', class: 'clear-lamp-clear' },
    6: { name: 'HARD CLEAR', color: '#FF6666', class: 'clear-lamp-hard' },
    7: { name: 'EX HARD CLEAR', color: '#FFFF99', class: 'clear-lamp-ex-hard' },
    8: { name: 'FULL COMBO', color: '#66E7F8', class: 'clear-lamp-full-combo' },
    9: { name: 'PERFECT', color: '#85FAC0', class: 'clear-lamp-perfect' },
    10: { name: 'MAX', color: '#F3E8FF', class: 'clear-lamp-max' }
  };
  
  return lampMap[clearType] || lampMap[1];
}

// 楽曲情報を表示するための関数
function formatSongTitle(song) {
  if (!song.title || song.title.trim() === '') {
    return '[Unknown Song]';
  }
  
  let title = song.title;
  if (song.subtitle && song.subtitle.trim() !== '') {
    title += ` ${song.subtitle}`;
  }
  
  // 30文字で打ち切り
  if (title.length > 40) {
    title = title.substring(0, 40) + '...';
  }
  
  return title;
}

// 差分名を取得する関数
function getDifficultyName(song) {
  const diffMap = {
    0: 'BEGINNER',
    1: 'NORMAL', 
    2: 'HYPER',
    3: 'ANOTHER',
    4: 'INSANE',
    5: 'LEGGENDARIA'
  };
  
  return diffMap[song.playmode] || 'UNKNOWN';
}

// 楽曲アイテムを作成する関数
function createSongItem(song, index) {
  const currentLamp = getClearLampInfo(song.clear);
  
  const songTitle = formatSongTitle(song);
  const diffName = getDifficultyName(song);
  
  // デバッグ用ログ
  console.log('Song data:', song.title, {
    tableSymbol: song.tableSymbol,
    level: song.level,
    songLevel: song.songLevel,
    hasTableSymbol: !!(song.tableSymbol && song.tableSymbol.trim() !== '')
  });
  
  // 難易度表情報の表示（統合されたシンボル表示）
  let tableDisplay;
  if (song.tableSymbol && song.tableSymbol.trim() !== '') {
    tableDisplay = song.tableSymbol;
    console.log(`[DEBUG] Using difficulty table: ${tableDisplay}`);
  } else if (song.songLevel && song.songLevel > 0) {
    // 難易度表が設定されていないが、songdataのlevelがある場合
    tableDisplay = `☆${song.songLevel}`;
    console.log(`[DEBUG] Using songdata level: ${tableDisplay}`);
  } else if (song.level && song.level !== null && song.level !== undefined) {
    // 既存のlevelフィールドがある場合（後方互換性のため）
    tableDisplay = `☆${song.level}`;
    console.log(`[DEBUG] Using legacy level: ${tableDisplay}`);
  } else {
    tableDisplay = '☆N/A';
    console.log(`[DEBUG] No difficulty info available`);
  }
  
  // 正しいプロパティ名を使用
  const iidxScore = song.iidxScore || 0;
  const iidxMaxScore = song.iidxMaxScore || 0;
  const beatorajaScore = song.score || 0; // beatorajaの％スコア
  const missCount = song.minbp || 0;
  let djLevel = song.djLevel || 'F';

  // スコアレートを計算
  const scoreRate = beatorajaScore ? Math.round(beatorajaScore) : 0;
  
  // 更新差分情報を取得
  const scoreUpdate = song.updates ? song.updates.find(u => u.type === 'daily_score') : null;
  const missUpdate = song.updates ? song.updates.find(u => u.type === 'daily_miss') : null;
  
  // 更新差分の表示文字列を作成
  let scoreDiffText = '';
  let missDiffText = '';
  
  if (scoreUpdate && scoreUpdate.oldValue !== undefined && scoreUpdate.newValue !== undefined) {
    const scoreDiff = scoreUpdate.newValue - scoreUpdate.oldValue;
    if (scoreDiff > 0) {
      scoreDiffText = `+${scoreDiff}`;
    } else if (scoreDiff < 0) {
      scoreDiffText = `${scoreDiff}`;
    }
  }
  
  if (missUpdate && missUpdate.oldValue !== undefined && missUpdate.newValue !== undefined) {
    const missDiff = missUpdate.newValue - missUpdate.oldValue;
    if (missDiff > 0) {
      missDiffText = `+${missDiff}`;
    } else if (missDiff < 0) {
      missDiffText = `${missDiff}`;
    }
  }
  
  // clearUpdateからoldValueを取得（renderer.jsと同じ方式）
  const clearUpdate = song.updates ? song.updates.find(u => u.type === 'daily_clear') : null;
  
  // 前回と今回のクリアタイプから色を取得
  const currentClearTypeName = getClearTypeName(song.clear || 0);
  let previousClearTypeName;
  
  if (clearUpdate && clearUpdate.oldValue !== undefined) {
    // clearUpdate.oldValueがある場合はそれを使用（クリア改善があった場合）
    previousClearTypeName = getClearTypeName(clearUpdate.oldValue);
  } else {
    // clearUpdateがない場合は現在のクリアタイプと同じにする（更新なしの場合）
    previousClearTypeName = currentClearTypeName;
  }
  
  // デバッグログ
  console.log(`[DEBUG] Song: ${songTitle}`);
  console.log(`[DEBUG] Current clear: ${song.clear} (${currentClearTypeName})`);
  console.log(`[DEBUG] clearUpdate:`, clearUpdate);
  console.log(`[DEBUG] Previous clear: ${previousClearTypeName} (${clearUpdate ? 'from clearUpdate.oldValue' : 'same as current'})`);
  
  const currentClearColor = getClearTypeColor(song.clear || 0);  // clearlamp.html色
  const previousClearColor = getRendererClearTypeColor(previousClearTypeName);  // renderer.js色
  
  console.log(`[DEBUG] Current color: ${currentClearColor}`);
  console.log(`[DEBUG] Previous color: ${previousClearColor}`);
  
  const div = document.createElement('div');
  div.className = 'song-item';
  
  div.innerHTML = `
    <div class="clear-type-indicator">
      <div class="clear-type-previous" style="background-color: ${previousClearColor};" title="前回: ${previousClearTypeName}"></div>
      <div class="clear-type-current" style="background-color: ${currentClearColor};" title="今回: ${currentClearTypeName}"></div>
    </div>
    <div class="song-content">
      <!-- 1段目: 楽曲名と難易度 -->
      <div class="flex items-start text-sm justify-between">
        <span>
          <span>${songTitle}</span>
        </span>
        <span class="text-sm">${tableDisplay}</span>
      </div>
      <!-- 2段目: 更新差分情報 -->
      <div class="flex justify-between items-center text-xs text-muted-foreground" style="min-height: 16px;">
        <div class="flex gap-4">
          ${scoreDiffText ? `<span class="score-diff">${scoreDiffText}</span>` : ''}
        </div>
        <div>
          ${missDiffText ? `<span class="miss-diff">${missDiffText}</span>` : ''}
        </div>
      </div>
      <!-- 3段目: 現在のスコア情報 -->
      <div class="flex justify-between items-center">
        <div class="text-sm font-medium">
          <span class="font-bold">${iidxScore}</span>
          <span class="text-xs text-muted-foreground">
            <span class="mx-0.5">/</span>${iidxMaxScore}
          <span class="font-medium">(${scoreRate}%)</span>
          <span class="ml-1">${djLevel}</span>
          </span>
        </div>
        <div class="text-sm text-muted-foreground">
          <span class="ml-1">MISS:${missCount}</span>
        </div>
      </div>
    </div>
  `;
  
  return div;
}

// 楽曲リストを表示する関数（ページネーション対応）
function displaySongs(songs) {
  filteredSongs = songs || [];
  currentPage = 1; // 新しいデータの場合は最初のページに戻る
  displayCurrentPage();
}

// 現在のページの楽曲を表示する関数
function displayCurrentPage() {
  const songList = document.getElementById('songList');
  const songCount = document.getElementById('songCount');
  const pagination = document.getElementById('pagination');
  
  songList.innerHTML = '';
  
  if (!filteredSongs || filteredSongs.length === 0) {
    songList.innerHTML = '<div class="text-center py-4 text-muted-foreground">楽曲データがありません</div>';
    songCount.textContent = '0';
    pagination.style.display = 'none';
    return;
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(filteredSongs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredSongs.length);
  const currentPageSongs = filteredSongs.slice(startIndex, endIndex);
  
  // 楽曲アイテムを表示
  currentPageSongs.forEach((song, index) => {
    const songItem = createSongItem(song, startIndex + index);
    songList.appendChild(songItem);
  });
  
  // 件数表示を更新
  songCount.textContent = filteredSongs.length.toString();
  
  // ページネーションUIを更新
  updatePaginationUI(totalPages);
}

// ページネーションUIを更新する関数
function updatePaginationUI(totalPages) {
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');
  
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }
  
  pagination.style.display = 'flex';
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

// フィルターを適用する関数
function applyFilter(songs, filterType) {
  if (!songs || filterType === 'all') {
    return songs;
  }
  
  switch (filterType) {
    case 'clear-type':
      return songs.sort((a, b) => (b.clear || 0) - (a.clear || 0));
    case 'score-rate':
      return songs.sort((a, b) => {
        const rateA = a.score || 0; // beatorajaスコア（％）
        const rateB = b.score || 0;
        return rateB - rateA;
      });
    case 'miss-count':
      return songs.sort((a, b) => (a.minbp || 0) - (b.minbp || 0));
    case 'level':
      return songs.sort((a, b) => {
        // 難易度表がある楽曲を優先して表示し、数値レベルで比較
        const aHasTable = a.tableSymbol && a.tableSymbol !== '';
        const bHasTable = b.tableSymbol && b.tableSymbol !== '';
        
        if (aHasTable && !bHasTable) return -1;
        if (!aHasTable && bHasTable) return 1;
        
        // どちらも数値レベルで比較
        return (b.level || 0) - (a.level || 0);
      });
    default:
      return songs;
  }
}

// 総ノーツ数を計算する関数
function calculateTotalNotes(songs) {
  if (!songs || songs.length === 0) return 0;
  
  return songs.reduce((total, song) => {
    // renderer.jsと同じ方式：song.totalNotesを使用
    const totalNotes = song.totalNotes || 0;
    return total + totalNotes;
  }, 0);
}

// 日付をフォーマットする関数
function formatDate(dateString) {
  if (!dateString) return new Date().toLocaleDateString('ja-JP');
  
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('ja-JP').replace(/\//g, '/');
}

// メイン処理
let currentSongs = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 保存された統計情報を読み込み
    const savedStats = await window.api.loadSmartViewStats();
    
    // 日付を決定（保存された統計から取得、なければ今日の日付）
    let targetDate;
    if (savedStats && savedStats.selectedDate) {
      targetDate = savedStats.selectedDate;
    } else {
      targetDate = new Date().toISOString().split('T')[0];
    }
    
    const updateDateElement = document.getElementById('updateDate');
    updateDateElement.textContent = `${formatDate(targetDate)} の更新`;
    
    let songs;
    let totalNotes;
    
    if (savedStats && savedStats.songData) {
      // 保存された統計情報がある場合はそれを使用
      songs = savedStats.songData;
      totalNotes = savedStats.displayTotalNotes;
      
      console.log('Smart view using saved stats:', {
        selectedDate: savedStats.selectedDate,
        totalNotes: totalNotes,
        songsCount: songs.length,
        lastUpdated: savedStats.lastUpdated
      });
    } else {
      // 保存された統計情報がない場合は通常の方法で取得
      const response = await window.api.getUpdatedSongs(targetDate);
      console.log('Smart view response:', response);
      
      // 新しいデータ構造に対応（メインのrenderer.jsと同じ方式）
      songs = response.songs || response;
      totalNotes = calculateTotalNotes(songs);
      
      console.log('Smart view using live data (no saved stats available)');
    }
    
    currentSongs = songs;
    
    console.log('Smart view songs data:', songs);
    console.log('Songs length:', songs ? songs.length : 0);
    
    // 総ノーツ数を表示
    document.getElementById('totalNotes').textContent = totalNotes.toLocaleString();
    
    // 楽曲リストを表示
    displaySongs(songs);
    
    // フィルターイベントリスナーを追加
    const filterSelect = document.getElementById('filterSelect');
    filterSelect.addEventListener('change', (e) => {
      const newFilteredSongs = applyFilter([...currentSongs], e.target.value);
      displaySongs(newFilteredSongs);
    });
    
    // ページネーションイベントリスナーを追加
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        displayCurrentPage();
      }
    });
    
    nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredSongs.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        displayCurrentPage();
      }
    });
    
    // シェアボタンのイベントリスナーを追加
    const shareBtn = document.getElementById('shareBtn');
    shareBtn.addEventListener('click', () => {
      // シェア機能の実装（今後拡張可能）
      console.log('Share button clicked');
      // TODO: シェア機能を実装
    });
    
  } catch (error) {
    console.error('Error loading smart view data:', error);
    document.getElementById('songList').innerHTML = 
      '<div class="text-center py-4 text-red-500">データの読み込みに失敗しました</div>';
  }
});