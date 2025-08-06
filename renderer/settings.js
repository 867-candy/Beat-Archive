const state = {
  dbPaths: {
    score: '',
    scorelog: '',
    scoredatalog: '',
    songdata: ''
  },
  difficultyTables: []
};

// 設定を読み込み
async function loadSettings() {
  try {
    const config = await window.api.getConfig();
    Object.assign(state.dbPaths, config.dbPaths);
    state.difficultyTables = config.difficultyTables || [];
    updatePathDisplays();
    updateTableList();
  } catch (error) {
    showStatus('設定の読み込みに失敗しました: ' + error.message, 'error');
  }
}

// パス表示を更新
function updatePathDisplays() {
  document.getElementById('scorePath').textContent = state.dbPaths.score || '未設定';
  document.getElementById('scorelogPath').textContent = state.dbPaths.scorelog || '未設定';
  document.getElementById('scoredatalogPath').textContent = state.dbPaths.scoredatalog || '未設定';
  document.getElementById('songdataPath').textContent = state.dbPaths.songdata || '未設定';
}

// 難易度表リストを更新
function updateTableList() {
  const listEl = document.getElementById('tableList');
  
  if (state.difficultyTables.length === 0) {
    listEl.innerHTML = '<div class="empty-tables">難易度表が設定されていません</div>';
  } else {
    // 優先順位順でソート
    const sortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
    
    listEl.innerHTML = sortedTables.map((table, index) => {
      const originalIndex = state.difficultyTables.findIndex(t => 
        t.name === table.name && t.url === table.url
      );
      
      return `
        <div class="table-item" data-original-index="${originalIndex}" data-priority="${table.priority}">
          <div class="drag-handle">☰</div>
          <div class="table-info">
            <div class="table-name">${escapeHtml(table.name)}</div>
            <div class="table-url">${escapeHtml(table.url)}</div>
          </div>
          <div class="table-actions">
            <button class="btn-delete" data-original-index="${originalIndex}">削除</button>
          </div>
        </div>
      `;
    }).join('');
    
    // ドラッグアンドドロップのイベントリスナーを追加
    addDragAndDropListeners();
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 難易度表を追加
async function addTable() {
  const nameEl = document.getElementById('tableName');
  const urlEl = document.getElementById('tableUrl');
  
  // 要素の存在確認
  if (!nameEl || !urlEl) {
    console.error('フォーム要素が見つかりません');
    return;
  }
  
  let name = nameEl.value.trim();
  const url = urlEl.value.trim();
  
  if (!url) {
    showTableStatus('URLを入力してください', 'error');
    urlEl.focus();
    return;
  }
  
  // URLの簡単なバリデーション
  try {
    new URL(url);
  } catch {
    showTableStatus('正しいURLを入力してください', 'error');
    urlEl.focus();
    return;
  }
  
  // 同じURLが既に存在するかチェック
  if (state.difficultyTables.some(table => table.url === url)) {
    showTableStatus('同じURLの難易度表が既に存在します', 'error');
    urlEl.focus();
    return;
  }
  
  // 表名が空の場合、HeaderからTableNameを取得を試行
  if (!name) {
    try {
      showTableStatus('難易度表データを読み込み中...', 'info');
      const tableData = await window.api.loadDifficultyTable(url);
      if (tableData && tableData.header && tableData.header.name) {
        name = tableData.header.name;
        nameEl.value = name; // フィールドにも反映
        showTableStatus('難易度表の名前を自動取得しました', 'success');
      } else {
        showTableStatus('難易度表から名前を取得できませんでした。手動で入力してください', 'error');
        nameEl.focus();
        return;
      }
    } catch (error) {
      showTableStatus('難易度表の読み込みに失敗しました: ' + error.message, 'error');
      nameEl.focus();
      return;
    }
  }
  
  // 最後尾の優先度を取得して+1
  const maxPriority = state.difficultyTables.length > 0 
    ? Math.max(...state.difficultyTables.map(t => t.priority || 0)) 
    : 0;
  const priority = maxPriority + 1;
  
  // 新しい難易度表を追加
  state.difficultyTables.push({
    name,
    url,
    priority
  });
  
  // フォームをクリア
  nameEl.value = '';
  urlEl.value = '';
  
  updateTableList();
  
  // 設定を自動保存
  try {
    const newConfig = {
      dbPaths: state.dbPaths,
      difficultyTables: state.difficultyTables
    };
    await window.api.updateConfig(newConfig);
    showTableStatus(`難易度表「${name}」を追加し、設定を保存しました`, 'success');
  } catch (error) {
    showTableStatus(`難易度表「${name}」を追加しましたが、設定の保存に失敗しました: ${error.message}`, 'error');
  }
  
  // フォーカスを表名フィールドに移動
  setTimeout(() => {
    nameEl.focus();
  }, 100);
}

// ドラッグアンドドロップのイベントリスナーを追加
function addDragAndDropListeners() {
  const ddBox = document.getElementById('tableList');
  if (!ddBox) return;
  
  const ddBoxList = ddBox.querySelectorAll('.table-item');
  let data = {
    target: null,
    diffX: 0,
    diffY: 0,
    cloneName: ''
  };
  
  const util = {
    index(el) {
      const parent = el.parentElement;
      const siblings = parent.children;
      const siblingsArr = [].slice.call(siblings);
      return siblingsArr.indexOf(el);
    },
    
    insertClone(target, insertIdx) {
      const cloneName = `ddItemClone_${Math.trunc(Math.random() * 10000)}`;
      const clone = target.cloneNode(true);
      const parent = target.parentElement;
      const siblings = parent.children;
      
      clone.classList.add('hidden');
      clone.classList.add(cloneName);
      clone.style.visibility = 'hidden';
      
      if (insertIdx < siblings.length) {
        siblings[insertIdx].insertAdjacentElement('afterend', clone);
      } else {
        parent.appendChild(clone);
      }
      
      return cloneName;
    },
    
    swap(target) {
      const selfIdx = util.index(target);
      const cloneIdx = selfIdx + 1;
      const parent = target.parentElement;
      const siblings = parent.querySelectorAll(`:scope > .table-item:not(.onGrab):not(.${data.cloneName})`);
      
      for (let thatIdx = 0, len = siblings.length; thatIdx < len; thatIdx++) {
        const targetRect = target.getBoundingClientRect();
        const that = siblings[thatIdx];
        const thatRect = that.getBoundingClientRect();
        const thatRectYHalf = thatRect.top + (thatRect.height / 2);
        
        const hitY = targetRect.top <= thatRectYHalf && 
                     (targetRect.top + targetRect.height) >= thatRectYHalf;
        
        if (hitY) {
          const siblingsAll = parent.children;
          const clone = siblingsAll[cloneIdx];
          
          if (clone && that) {
            parent.insertBefore(clone, selfIdx > thatIdx ? that : that.nextSibling);
            parent.insertBefore(target, clone);
          }
          break;
        }
      }
    }
  };
  
  const ev = {
    down(e) {
      // ドラッグハンドル以外では処理しない
      if (!e.target.classList.contains('drag-handle')) return;
      
      e.preventDefault();
      const target = e.target.closest('.table-item');
      if (!target) return;
      
      const pageX = e.pageX;
      const pageY = e.pageY;
      const targetW = target.offsetWidth;
      const targetRect = target.getBoundingClientRect();
      
      data.target = target;
      data.diffX = pageX - targetRect.left;
      data.diffY = pageY - targetRect.top;
      data.cloneName = util.insertClone(target, util.index(target));
      
      target.style.width = `${targetW}px`;
      target.style.zIndex = '1000';
      target.classList.add('onGrab');
      
      document.addEventListener('mousemove', ev.move);
      document.addEventListener('mouseup', ev.up);
      document.body.style.userSelect = 'none';
    },
    
    move(e) {
      if (!data.target) return;
      
      const pageX = e.pageX;
      const pageY = e.pageY;
      const targetPosL = pageX - data.diffX;
      const targetPosT = pageY - data.diffY;
      
      data.target.style.position = 'fixed';
      data.target.style.left = `${targetPosL}px`;
      data.target.style.top = `${targetPosT}px`;
      data.target.style.pointerEvents = 'none';
      
      util.swap(data.target);
    },
    
    async up() {
      if (!data.target) return;
      
      const target = data.target;
      const cloneSelector = `.${data.cloneName}`;
      const clone = document.querySelector(cloneSelector);
      
      // クリーンアップ
      if (clone) {
        clone.remove();
      }
      
      target.removeAttribute('style');
      target.classList.remove('onGrab');
      target.classList.remove('onDrag');
      
      document.removeEventListener('mousemove', ev.move);
      document.removeEventListener('mouseup', ev.up);
      document.body.style.userSelect = '';
      
      // 優先順位を更新
      await updatePriorityFromOrder();
      
      // データをリセット
      data = {
        target: null,
        diffX: 0,
        diffY: 0,
        cloneName: ''
      };
    }
  };
  
  ddBoxList.forEach((el) => {
    const dragHandle = el.querySelector('.drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', ev.down);
      dragHandle.style.cursor = 'grab';
    }
  });
}

// 表示順序から優先順位を更新
async function updatePriorityFromOrder() {
  const tableItems = document.querySelectorAll('.table-item');
  
  tableItems.forEach((item, index) => {
    const originalIndex = parseInt(item.dataset.originalIndex);
    if (!isNaN(originalIndex) && originalIndex < state.difficultyTables.length) {
      state.difficultyTables[originalIndex].priority = index + 1;
    }
  });
  
  // 設定を自動保存
  try {
    const newConfig = {
      dbPaths: state.dbPaths,
      difficultyTables: state.difficultyTables
    };
    await window.api.updateConfig(newConfig);
    showTableStatus('優先順位を更新しました', 'success');
  } catch (error) {
    showTableStatus(`優先順位の保存に失敗しました: ${error.message}`, 'error');
  }
}

// テーブルの順序を変更
async function reorderTables(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  
  // 優先順位を再計算
  const sortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
  const fromTable = state.difficultyTables[fromIndex];
  const toTable = state.difficultyTables[toIndex];
  
  // 移動先の優先順位を取得
  const sortedFromIndex = sortedTables.findIndex(t => t === fromTable);
  const sortedToIndex = sortedTables.findIndex(t => t === toTable);
  
  // 新しい優先順位を計算
  if (sortedFromIndex < sortedToIndex) {
    // 下に移動
    fromTable.priority = toTable.priority + 0.5;
  } else {
    // 上に移動
    fromTable.priority = toTable.priority - 0.5;
  }
  
  // 全ての優先順位を正規化（1から連番に）
  const newSortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
  newSortedTables.forEach((table, index) => {
    table.priority = index + 1;
  });
  
  updateTableList();
  
  // 設定を自動保存
  try {
    const newConfig = {
      dbPaths: state.dbPaths,
      difficultyTables: state.difficultyTables
    };
    await window.api.updateConfig(newConfig);
    showTableStatus('優先順位を更新しました', 'success');
  } catch (error) {
    showTableStatus(`優先順位の保存に失敗しました: ${error.message}`, 'error');
  }
}

// 優先順位を更新
async function updatePriority(originalIndex, newPriority) {
  if (originalIndex < 0 || originalIndex >= state.difficultyTables.length) {
    showTableStatus('無効なテーブルインデックスです', 'error');
    return;
  }
  
  const priority = parseInt(newPriority);
  if (isNaN(priority) || priority < 1) {
    showTableStatus('優先順位は1以上の数値を入力してください', 'error');
    return;
  }
  
  state.difficultyTables[originalIndex].priority = priority;
  updateTableList();
  
  // 設定を自動保存
  try {
    const newConfig = {
      dbPaths: state.dbPaths,
      difficultyTables: state.difficultyTables
    };
    await window.api.updateConfig(newConfig);
    showTableStatus('優先順位を更新しました', 'success');
  } catch (error) {
    showTableStatus(`優先順位の保存に失敗しました: ${error.message}`, 'error');
  }
}

// テーブルを上に移動
async function moveTableUp(originalIndex) {
  if (originalIndex < 0 || originalIndex >= state.difficultyTables.length) {
    return;
  }
  
  const currentTable = state.difficultyTables[originalIndex];
  const sortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
  const currentSortedIndex = sortedTables.findIndex(t => 
    t.name === currentTable.name && t.url === currentTable.url
  );
  
  if (currentSortedIndex > 0) {
    const targetTable = sortedTables[currentSortedIndex - 1];
    const targetOriginalIndex = state.difficultyTables.findIndex(t => 
      t.name === targetTable.name && t.url === targetTable.url
    );
    
    // 優先順位を入れ替え
    const tempPriority = currentTable.priority;
    state.difficultyTables[originalIndex].priority = targetTable.priority;
    state.difficultyTables[targetOriginalIndex].priority = tempPriority;
    
    updateTableList();
    
    // 設定を自動保存
    try {
      const newConfig = {
        dbPaths: state.dbPaths,
        difficultyTables: state.difficultyTables
      };
      await window.api.updateConfig(newConfig);
      showTableStatus('順序を更新しました', 'success');
    } catch (error) {
      showTableStatus(`順序の保存に失敗しました: ${error.message}`, 'error');
    }
  }
}

// テーブルを下に移動
async function moveTableDown(originalIndex) {
  if (originalIndex < 0 || originalIndex >= state.difficultyTables.length) {
    return;
  }
  
  const currentTable = state.difficultyTables[originalIndex];
  const sortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
  const currentSortedIndex = sortedTables.findIndex(t => 
    t.name === currentTable.name && t.url === currentTable.url
  );
  
  if (currentSortedIndex < sortedTables.length - 1) {
    const targetTable = sortedTables[currentSortedIndex + 1];
    const targetOriginalIndex = state.difficultyTables.findIndex(t => 
      t.name === targetTable.name && t.url === targetTable.url
    );
    
    // 優先順位を入れ替え
    const tempPriority = currentTable.priority;
    state.difficultyTables[originalIndex].priority = targetTable.priority;
    state.difficultyTables[targetOriginalIndex].priority = tempPriority;
    
    updateTableList();
    
    // 設定を自動保存
    try {
      const newConfig = {
        dbPaths: state.dbPaths,
        difficultyTables: state.difficultyTables
      };
      await window.api.updateConfig(newConfig);
      showTableStatus('順序を更新しました', 'success');
    } catch (error) {
      showTableStatus(`順序の保存に失敗しました: ${error.message}`, 'error');
    }
  }
}

// 難易度表を削除
async function removeTable(originalIndex) {
  // originalIndexは元の配列でのインデックス
  if (originalIndex < 0 || originalIndex >= state.difficultyTables.length) {
    showTableStatus('無効なテーブルインデックスです', 'error');
    return;
  }
  
  const tableToRemove = state.difficultyTables[originalIndex];
  
  // Electronの既知の不具合回避：confirm()の代わりにネイティブダイアログを使用
  const shouldDelete = await window.api.showConfirmDialog(
    `難易度表「${tableToRemove.name}」を削除しますか？`,
    '難易度表の削除'
  );
  
  if (shouldDelete) {
    // 元の配列から削除
    state.difficultyTables.splice(originalIndex, 1);
    updateTableList();
    
    // 設定を自動保存
    try {
      const newConfig = {
        dbPaths: state.dbPaths,
        difficultyTables: state.difficultyTables
      };
      await window.api.updateConfig(newConfig);
      showTableStatus(`難易度表「${tableToRemove.name}」を削除し、設定を保存しました`, 'success');
    } catch (error) {
      showTableStatus(`難易度表「${tableToRemove.name}」を削除しましたが、設定の保存に失敗しました: ${error.message}`, 'error');
    }
  }
}

// ステータス表示
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // 3秒後に自動的に非表示
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// 難易度表ステータス表示（新規追加）
function showTableStatus(message, type = 'success') {
  const statusEl = document.getElementById('tableStatus');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // 3秒後に自動的に非表示
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// イベントリスナー設定（一度だけ実行）
function setupEventListeners() {
  // 既にイベントリスナーが設定されている場合はスキップ
  if (document.body._settingsListenersAdded) {
    return;
  }
  
  // DBファイル選択ボタン
  document.getElementById('selectScore').addEventListener('click', async () => {
    try {
      const path = await window.api.selectDbPath();
      if (path) {
        state.dbPaths.score = path;
        updatePathDisplays();
      }
    } catch (error) {
      showStatus('ファイル選択に失敗しました: ' + error.message, 'error');
    }
  });

  document.getElementById('selectScorelog').addEventListener('click', async () => {
    try {
      const path = await window.api.selectDbPath();
      if (path) {
        state.dbPaths.scorelog = path;
        updatePathDisplays();
      }
    } catch (error) {
      showStatus('ファイル選択に失敗しました: ' + error.message, 'error');
    }
  });

  document.getElementById('selectScoredatalog').addEventListener('click', async () => {
    try {
      const path = await window.api.selectDbPath();
      if (path) {
        state.dbPaths.scoredatalog = path;
        updatePathDisplays();
      }
    } catch (error) {
      showStatus('ファイル選択に失敗しました: ' + error.message, 'error');
    }
  });

  document.getElementById('selectSongdata').addEventListener('click', async () => {
    try {
      const path = await window.api.selectDbPath();
      if (path) {
        state.dbPaths.songdata = path;
        updatePathDisplays();
      }
    } catch (error) {
      showStatus('ファイル選択に失敗しました: ' + error.message, 'error');
    }
  });

  // 設定保存ボタン
  document.getElementById('saveConfig').addEventListener('click', async () => {
    try {
      const newConfig = {
        dbPaths: state.dbPaths,
        difficultyTables: state.difficultyTables
      };
      await window.api.updateConfig(newConfig);
      showStatus('設定を保存しました', 'success');
    } catch (error) {
      showStatus('設定の保存に失敗しました: ' + error.message, 'error');
    }
  });
  
  // 難易度表追加ボタン
  const addBtn = document.getElementById('addTableBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      await addTable();
    });
  }
  
  // フォーム入力フィールドのEnterキー処理
  const formFields = ['tableName', 'tableUrl', 'tablePriority'];
  formFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await addTable();
        }
      });
    }
  });
  
  // イベント委任を使用して削除ボタンのクリックを処理
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete') && e.target.hasAttribute('data-original-index')) {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      if (!isNaN(originalIndex)) {
        await removeTable(originalIndex);
      }
    }
    
    // 上移動ボタン
    if (e.target.classList.contains('btn-move-up') && e.target.hasAttribute('data-original-index')) {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      if (!isNaN(originalIndex)) {
        await moveTableUp(originalIndex);
      }
    }
    
    // 下移動ボタン
    if (e.target.classList.contains('btn-move-down') && e.target.hasAttribute('data-original-index')) {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      if (!isNaN(originalIndex)) {
        await moveTableDown(originalIndex);
      }
    }
    
    // 優先順位保存ボタン
    if (e.target.classList.contains('btn-save-priority') && e.target.hasAttribute('data-original-index')) {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      const priorityInput = document.querySelector(`input.priority-input[data-original-index="${originalIndex}"]`);
      if (!isNaN(originalIndex) && priorityInput) {
        await updatePriority(originalIndex, priorityInput.value);
      }
    }
  });
  
  // 優先順位入力フィールドのEnterキー処理
  document.addEventListener('keypress', async (e) => {
    if (e.target.classList.contains('priority-input') && e.key === 'Enter') {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      if (!isNaN(originalIndex)) {
        await updatePriority(originalIndex, e.target.value);
      }
    }
  });
  
  // フラグを設定してイベントリスナーの重複登録を防ぐ
  document.body._settingsListenersAdded = true;
}

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});
