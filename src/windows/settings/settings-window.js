const state = {
  dbPaths: {
    playerDbFolder: '', // 新しく追加: プレイヤーDBフォルダ
    score: '',
    scorelog: '',
    scoredatalog: '',
    songdata: ''
  },
  difficultyTables: [],
  defaultTableUrls: [], // 変更: 複数の難易度表URLを格納する配列
  discordWebhookUrl: '' // Discord Webhook URL設定
};

// 設定を読み込み
async function loadSettings() {
  try {
    const config = await window.api.getConfig();
    Object.assign(state.dbPaths, config.dbPaths);
    state.difficultyTables = config.difficultyTables || [];
    state.discordWebhookUrl = config.discordWebhookUrl || '';
    
    // 既存の難易度表にsavedFiles情報がない場合の互換性処理
    state.difficultyTables.forEach(table => {
      if (!table.hasOwnProperty('savedFiles')) {
        table.savedFiles = null;
      }
    });
    
    // 旧設定形式との互換性を保つ
    if (config.defaultTableUrl && !config.defaultTableUrls) {
      console.log('Using legacy defaultTableUrl:', config.defaultTableUrl);
      state.defaultTableUrls = [config.defaultTableUrl];
    } else {
      console.log('Using defaultTableUrls from config:', config.defaultTableUrls);
      state.defaultTableUrls = config.defaultTableUrls || [];
    }
    
    console.log('Initial state.defaultTableUrls:', JSON.stringify(state.defaultTableUrls));
    
    updatePathDisplays();
    await updateTableList();
    updateDiscordDisplay();
    setupEventListeners();
    
    // 起動時に設定された難易度表のローカル保存チェック（無効化）
    // await checkAndCacheDifficultyTables();
  } catch (error) {
    showStatus('設定の読み込みに失敗しました: ' + error.message, 'error');
  }
}

// パス表示を更新
function updatePathDisplays() {
  document.getElementById('playerDbFolderPath').textContent = state.dbPaths.playerDbFolder || '未設定';
  document.getElementById('songdataPath').textContent = state.dbPaths.songdata || '未設定';
  
  // DBファイルの検出状況を更新
  updateDbFileStatus();
}

// DBファイルの検出状況を更新
async function updateDbFileStatus() {
  const playerDbFolder = state.dbPaths.playerDbFolder;
  
  if (!playerDbFolder) {
    // フォルダが未設定の場合
    document.getElementById('scoreStatus').textContent = '未検出';
    document.getElementById('scoreStatus').className = 'file-status missing';
    document.getElementById('scorelogStatus').textContent = '未検出';
    document.getElementById('scorelogStatus').className = 'file-status missing';
    document.getElementById('scoredatalogStatus').textContent = '未検出';
    document.getElementById('scoredatalogStatus').className = 'file-status missing';
    return;
  }
  
  // 各DBファイルの存在確認
  const dbFiles = ['score.db', 'scorelog.db', 'scoredatalog.db'];
  
  for (const dbFile of dbFiles) {
    try {
      const fullPath = await window.api.joinPath(playerDbFolder, dbFile);
      const exists = await window.api.fileExists(fullPath);
      
      const statusElement = document.getElementById(dbFile.replace('.db', 'Status'));
      if (exists) {
        statusElement.textContent = '検出済み';
        statusElement.className = 'file-status found';
        
        // stateを更新
        const dbType = dbFile.replace('.db', '');
        state.dbPaths[dbType] = fullPath;
      } else {
        statusElement.textContent = '未検出';
        statusElement.className = 'file-status missing';
        
        // stateをクリア
        const dbType = dbFile.replace('.db', '');
        state.dbPaths[dbType] = '';
      }
    } catch (error) {
      console.error(`${dbFile}の確認中にエラー:`, error);
      const statusElement = document.getElementById(dbFile.replace('.db', 'Status'));
      statusElement.textContent = 'エラー';
      statusElement.className = 'file-status missing';
    }
  }
}

// 難易度表リストを更新
async function updateTableList() {
  const listEl = document.getElementById('tableList');
  
  console.log('Updating table list. Current defaultTableUrls:', state.defaultTableUrls);
  
  if (state.difficultyTables.length === 0) {
    listEl.innerHTML = '<div class="empty-tables">難易度表が設定されていません</div>';
  } else {
    // 優先順位順でソート
    const sortedTables = [...state.difficultyTables].sort((a, b) => a.priority - b.priority);
    
    // 各テーブルのローカル保存状況をチェック
    const tableItems = await Promise.all(sortedTables.map(async (table, index) => {
      const originalIndex = state.difficultyTables.findIndex(t => 
        t.name === table.name && t.url === table.url
      );
      
      const isChecked = state.defaultTableUrls.includes(table.url);
      console.log(`Table ${table.name}: ${table.url} - checked: ${isChecked}`);
      
      // ローカル保存状況をチェック
      let saveStatus = '';
      try {
        // まず、savedFiles情報がある場合はそれを使用
        if (table.savedFiles && table.savedFiles.headerPath && table.savedFiles.dataPath) {
          // ファイルが実際に存在するかチェック
          const headerExists = await window.api.fileExists(table.savedFiles.headerPath);
          const dataExists = await window.api.fileExists(table.savedFiles.dataPath);
          
          if (headerExists && dataExists) {
            const savedDate = new Date(table.savedFiles.savedAt).toLocaleDateString('ja-JP');
            saveStatus = `<span class="save-status saved">💾 保存済み (${savedDate})</span>`;
          } else {
            saveStatus = '<span class="save-status error">⚠️ ファイル欠損</span>';
          }
        } else {
          // 従来の方法でチェック
          const saveInfo = await window.api.checkSavedDifficultyTable(table.url);
          if (saveInfo.exists) {
            saveStatus = '<span class="save-status saved">💾 保存済み</span>';
          } else {
            saveStatus = '<span class="save-status not-saved">❌ 未保存</span>';
          }
        }
      } catch (error) {
        saveStatus = '<span class="save-status error">⚠️ エラー</span>';
      }
      
      return `
        <div class="table-item" data-original-index="${originalIndex}" data-priority="${table.priority}">
          <div class="drag-handle">☰</div>
          <div class="table-info">
            <div class="table-name">${escapeHtml(table.name)} ${saveStatus}</div>
            <div class="table-url">${escapeHtml(table.url)}</div>
          </div>
          <div class="table-checkbox-container">
            <input type="checkbox" class="table-checkbox" id="checkbox-${originalIndex}" 
                   data-table-url="${escapeHtml(table.url)}" 
                   ${state.defaultTableUrls.includes(table.url) ? 'checked' : ''}>
            <label for="checkbox-${originalIndex}" class="table-checkbox-label">更新曲一覧で使用</label>
            <button class="btn-update" data-original-index="${originalIndex}" data-table-url="${escapeHtml(table.url)}" data-table-name="${escapeHtml(table.name)}">更新</button>
          </div>
          <div class="table-actions">
            <button class="btn-delete" data-original-index="${originalIndex}">削除</button>
          </div>
        </div>
      `;
    }));
    
    listEl.innerHTML = tableItems.join('');
    
    // ドラッグアンドドロップのイベントリスナーを追加
    addDragAndDropListeners();
    
    // チェックボックスのイベントリスナーを追加
    addCheckboxListeners();
  }
}

// チェックボックスのイベントリスナーを追加
function addCheckboxListeners() {
  const checkboxes = document.querySelectorAll('.table-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleCheckboxChange);
  });
}

// チェックボックスの変更を処理
async function handleCheckboxChange(event) {
  const checkbox = event.target;
  const tableUrl = checkbox.dataset.tableUrl;
  
  console.log(`Checkbox changed for ${tableUrl}: ${checkbox.checked}`);
  console.log('Before change - defaultTableUrls:', JSON.stringify(state.defaultTableUrls));
  
  if (checkbox.checked) {
    // チェックされた場合、リストに追加
    if (!state.defaultTableUrls.includes(tableUrl)) {
      console.log(`Adding ${tableUrl} to defaultTableUrls`);
      state.defaultTableUrls.push(tableUrl);
    } else {
      console.log(`${tableUrl} already exists in defaultTableUrls`);
    }
  } else {
    // チェックが外された場合、リストから削除
    const index = state.defaultTableUrls.indexOf(tableUrl);
    if (index > -1) {
      console.log(`Removing ${tableUrl} from defaultTableUrls at index ${index}`);
      state.defaultTableUrls.splice(index, 1);
    } else {
      console.log(`${tableUrl} not found in defaultTableUrls`);
    }
  }
  
  console.log('After change - defaultTableUrls:', JSON.stringify(state.defaultTableUrls));
  console.log('更新曲一覧で使用する難易度表:', state.defaultTableUrls);
  
  // 設定を即座に保存
  try {
    const newConfig = createConfigObject();
    console.log('Saving config with defaultTableUrls:', newConfig.defaultTableUrls);
    await window.api.updateConfig(newConfig);
    
    // 選択された難易度表の名前を取得
    const selectedTable = state.difficultyTables.find(table => table.url === tableUrl);
    const tableName = selectedTable ? selectedTable.name : 'Unknown';
    
    if (checkbox.checked) {
      showTableStatus(`「${tableName}」を更新曲一覧で使用するように設定しました`, 'success');
    } else {
      showTableStatus(`「${tableName}」を更新曲一覧で使用しないように設定しました`, 'success');
    }
  } catch (error) {
    showTableStatus('設定の保存に失敗しました: ' + error.message, 'error');
    // エラーの場合はチェックボックスの状態を元に戻す
    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
      if (!state.defaultTableUrls.includes(tableUrl)) {
        state.defaultTableUrls.push(tableUrl);
      }
    } else {
      const index = state.defaultTableUrls.indexOf(tableUrl);
      if (index > -1) {
        state.defaultTableUrls.splice(index, 1);
      }
    }
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 設定オブジェクトを作成
function createConfigObject() {
  console.log('Creating config object with state.defaultTableUrls:', JSON.stringify(state.defaultTableUrls));
  return {
    dbPaths: state.dbPaths,
    difficultyTables: state.difficultyTables,
    defaultTableUrls: state.defaultTableUrls
  };
}

// 難易度表を追加
async function addTable() {
  const urlEl = document.getElementById('tableUrl');
  
  // 要素の存在確認
  if (!urlEl) {
    console.error('フォーム要素が見つかりません');
    return;
  }
  
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
  
  // 難易度表データから表名を取得
  let name;
  let tableData;
  let savedHeaderPath = null;
  let savedDataPath = null;
  let urlHash = null;
  
  try {
    showTableStatus('難易度表データを読み込み中...', 'info');
    tableData = await window.api.loadDifficultyTable(url);
    
    // ヘッダーから名前を取得（優先順位: header.name -> header.symbol -> URLから推測）
    name = tableData.header?.name || tableData.header?.symbol;
    
    if (name) {
      showTableStatus('難易度表の名前を自動取得しました', 'success');
    } else {
      // ヘッダーから名前が取得できない場合、URLから推測
      name = extractTableNameFromUrl(url);
      showTableStatus('URLから難易度表の名前を推測しました', 'info');
    }
    
    // データをローカルに保存
    
    try {
      showTableStatus('難易度表データをローカルに保存中...', 'info');
      const saveResult = await window.api.saveDifficultyTableData(url, tableData.header, tableData.body);
      if (saveResult.success) {
        savedHeaderPath = saveResult.headerPath;
        savedDataPath = saveResult.dataPath;
        urlHash = saveResult.urlHash;
        showTableStatus('難易度表データのローカル保存が完了しました', 'success');
        console.log(`ローカル保存完了: ${name}`, saveResult);
      } else {
        console.error('ローカル保存失敗:', saveResult.error);
        showTableStatus('ローカル保存に失敗しましたが、追加を続行します', 'warning');
      }
    } catch (saveError) {
      console.error('ローカル保存中にエラー:', saveError);
      showTableStatus('ローカル保存中にエラーが発生しましたが、追加を続行します', 'warning');
    }
    
  } catch (error) {
    console.error('難易度表の読み込みエラー:', error);
    // エラーが発生した場合でもURLから名前を推測して処理を続行
    name = extractTableNameFromUrl(url);
    showTableStatus('難易度表の読み込みに失敗しましたが、URLから名前を推測して追加します', 'warning');
  }
  
  // 最後尾の優先度を取得して+1
  const maxPriority = state.difficultyTables.length > 0 
    ? Math.max(...state.difficultyTables.map(t => t.priority || 0)) 
    : 0;
  const priority = maxPriority + 1;
  
  // 新しい難易度表を追加
  const newTable = {
    name,
    url,
    priority,
    // ローカル保存されたファイルパス情報
    savedFiles: savedHeaderPath && savedDataPath ? {
      headerPath: savedHeaderPath,
      dataPath: savedDataPath,
      urlHash: urlHash,
      savedAt: new Date().toISOString()
    } : null
  };
  
  state.difficultyTables.push(newTable);
  
  // フォームをクリア
  urlEl.value = '';
  
  await updateTableList();
  
  // 設定を自動保存
  try {
    console.log('設定保存を開始します...');
    console.log('保存前のstate.difficultyTables:', JSON.stringify(state.difficultyTables, null, 2));
    
    const newConfig = createConfigObject();
    console.log('createConfigObject結果:', JSON.stringify(newConfig, null, 2));
    
    await window.api.updateConfig(newConfig);
    console.log('設定保存が完了しました');
    showTableStatus(`難易度表「${name}」を追加し、設定を保存しました`, 'success');
    
    // ローカル保存を実行（無効化）
    // await cacheDifficultyTable(url, name);
  } catch (error) {
    console.error('設定保存エラー:', error);
    showTableStatus(`難易度表「${name}」を追加しましたが、設定の保存に失敗しました: ${error.message}`, 'error');
  }
  
  // フォーカスをURLフィールドに移動
  setTimeout(() => {
    urlEl.focus();
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
    const newConfig = createConfigObject();
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
  
  await updateTableList();
  
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
  await updateTableList();
  
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
    
    await updateTableList();
    
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
    
    await updateTableList();
    
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

// 難易度表を更新
async function updateTable(originalIndex) {
  if (originalIndex < 0 || originalIndex >= state.difficultyTables.length) {
    showTableStatus('無効なテーブルインデックスです', 'error');
    return;
  }
  
  const table = state.difficultyTables[originalIndex];
  const tableName = table.name;
  const tableUrl = table.url;
  
  try {
    showTableStatus(`「${tableName}」のデータを更新中...`, 'info');
    
    // 難易度表データを再取得
    const tableData = await window.api.loadDifficultyTable(tableUrl);
    
    // ヘッダーから名前を取得（名前が変更されている可能性があるため）
    const newName = tableData.header?.name || tableData.header?.symbol || tableName;
    
    // データをローカルに保存
    let savedHeaderPath = null;
    let savedDataPath = null;
    let urlHash = null;
    
    try {
      showTableStatus(`「${tableName}」のデータをローカルに保存中...`, 'info');
      const saveResult = await window.api.saveDifficultyTableData(tableUrl, tableData.header, tableData.body);
      if (saveResult.success) {
        savedHeaderPath = saveResult.headerPath;
        savedDataPath = saveResult.dataPath;
        urlHash = saveResult.urlHash;
        showTableStatus(`「${tableName}」のローカル保存が完了しました`, 'success');
        console.log(`ローカル保存完了: ${tableName}`, saveResult);
      } else {
        console.error('ローカル保存失敗:', saveResult.error);
        showTableStatus('ローカル保存に失敗しましたが、更新を続行します', 'warning');
      }
    } catch (saveError) {
      console.error('ローカル保存中にエラー:', saveError);
      showTableStatus('ローカル保存中にエラーが発生しましたが、更新を続行します', 'warning');
    }
    
    // テーブル情報を更新
    state.difficultyTables[originalIndex] = {
      ...table,
      name: newName,
      savedFiles: savedHeaderPath && savedDataPath ? {
        headerPath: savedHeaderPath,
        dataPath: savedDataPath,
        urlHash: urlHash,
        savedAt: new Date().toISOString()
      } : table.savedFiles // 保存に失敗した場合は既存の情報を保持
    };
    
    await updateTableList();
    
    // 設定を自動保存
    try {
      const newConfig = createConfigObject();
      await window.api.updateConfig(newConfig);
      showTableStatus(`難易度表「${newName}」を更新し、設定を保存しました`, 'success');
    } catch (error) {
      showTableStatus(`難易度表「${newName}」を更新しましたが、設定の保存に失敗しました: ${error.message}`, 'error');
    }
    
  } catch (error) {
    console.error('難易度表の更新エラー:', error);
    showTableStatus(`難易度表「${tableName}」の更新に失敗しました: ${error.message}`, 'error');
  }
}

// 全ての難易度表を一括更新
async function bulkUpdateTables() {
  if (state.difficultyTables.length === 0) {
    showTableStatus('更新する難易度表がありません', 'info');
    return;
  }
  
  // 確認ダイアログを表示
  const shouldUpdate = await window.api.showConfirmDialog(
    `全ての難易度表（${state.difficultyTables.length}個）を一括更新しますか？\n時間がかかる場合があります。`,
    '一括更新の確認'
  );
  
  if (!shouldUpdate) {
    return;
  }
  
  const totalTables = state.difficultyTables.length;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  // 一括更新ボタンを無効化
  const bulkUpdateBtn = document.getElementById('bulkUpdateTablesBtn');
  if (bulkUpdateBtn) {
    bulkUpdateBtn.disabled = true;
    bulkUpdateBtn.textContent = '更新中...';
  }
  
  showTableStatus('一括更新を開始します...', 'info');
  
  // 各難易度表を順番に更新
  for (let i = 0; i < state.difficultyTables.length; i++) {
    const table = state.difficultyTables[i];
    const tableName = table.name;
    const tableUrl = table.url;
    
    try {
      showTableStatus(`更新中... (${i + 1}/${totalTables}): ${tableName}`, 'info');
      
      // 難易度表データを再取得
      const tableData = await window.api.loadDifficultyTable(tableUrl);
      
      // ヘッダーから名前を取得（名前が変更されている可能性があるため）
      const newName = tableData.header?.name || tableData.header?.symbol || tableName;
      
      // データをローカルに保存
      let savedHeaderPath = null;
      let savedDataPath = null;
      let urlHash = null;
      
      try {
        const saveResult = await window.api.saveDifficultyTableData(tableUrl, tableData.header, tableData.body);
        if (saveResult.success) {
          savedHeaderPath = saveResult.headerPath;
          savedDataPath = saveResult.dataPath;
          urlHash = saveResult.urlHash;
          console.log(`一括更新 - ローカル保存完了: ${tableName}`);
        } else {
          console.error(`一括更新 - ローカル保存失敗: ${tableName}`, saveResult.error);
        }
      } catch (saveError) {
        console.error(`一括更新 - ローカル保存中にエラー: ${tableName}`, saveError);
      }
      
      // テーブル情報を更新
      state.difficultyTables[i] = {
        ...table,
        name: newName,
        savedFiles: savedHeaderPath && savedDataPath ? {
          headerPath: savedHeaderPath,
          dataPath: savedDataPath,
          urlHash: urlHash,
          savedAt: new Date().toISOString()
        } : table.savedFiles // 保存に失敗した場合は既存の情報を保持
      };
      
      successCount++;
      console.log(`一括更新成功: ${newName} (${i + 1}/${totalTables})`);
      
    } catch (error) {
      console.error(`一括更新エラー (${tableName}):`, error);
      errorCount++;
      
      // ネットワークエラーなど、データ取得に失敗した場合はスキップとして扱う
      if (error.message.includes('fetch') || error.message.includes('network')) {
        skippedCount++;
      }
    }
  }
  
  // UIを更新
  await updateTableList();
  
  // 設定を自動保存
  try {
    const newConfig = createConfigObject();
    await window.api.updateConfig(newConfig);
    
    // 結果メッセージを表示
    const resultMessage = `一括更新完了: 成功 ${successCount}個, エラー ${errorCount}個`;
    showTableStatus(resultMessage, successCount > 0 ? 'success' : (errorCount > 0 ? 'warning' : 'info'));
    
  } catch (error) {
    showTableStatus(`一括更新は完了しましたが、設定の保存に失敗しました: ${error.message}`, 'error');
  }
  
  // 一括更新ボタンを有効化
  if (bulkUpdateBtn) {
    bulkUpdateBtn.disabled = false;
    bulkUpdateBtn.textContent = '🔄 全ての難易度表を一括更新';
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
    `難易度表「${tableToRemove.name}」を削除しますか？\n\n※ローカルに保存されているデータファイルも一緒に削除されます。`,
    '難易度表の削除'
  );
  
  if (shouldDelete) {
    // ローカル保存されているファイルを削除
    try {
      showTableStatus(`「${tableToRemove.name}」のローカルファイルを削除中...`, 'info');
      const deleteResult = await window.api.deleteSavedDifficultyTable(tableToRemove.url);
      
      if (deleteResult.success) {
        if (deleteResult.deletedFiles.length > 0) {
          console.log(`ローカルファイル削除完了: ${tableToRemove.name}`, deleteResult.deletedFiles);
          showTableStatus(`「${tableToRemove.name}」のローカルファイルを削除しました`, 'success');
        } else {
          console.log(`ローカルファイルは存在しませんでした: ${tableToRemove.name}`);
        }
      } else {
        console.error(`ローカルファイル削除エラー: ${tableToRemove.name}`, deleteResult.errors);
        showTableStatus(`ローカルファイルの削除中にエラーが発生しました: ${deleteResult.errors.join(', ')}`, 'warning');
      }
    } catch (deleteError) {
      console.error(`ローカルファイル削除中にエラー: ${tableToRemove.name}`, deleteError);
      showTableStatus(`ローカルファイルの削除中にエラーが発生しました: ${deleteError.message}`, 'warning');
    }
    
    // 元の配列から削除
    state.difficultyTables.splice(originalIndex, 1);
    await updateTableList();
    
    // 設定を自動保存
    try {
      const newConfig = createConfigObject();
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
  
  // DBファイル/フォルダ選択ボタン
  document.getElementById('selectPlayerDbFolder').addEventListener('click', async () => {
    try {
      const folderPath = await window.api.selectFolderPath();
      if (folderPath) {
        state.dbPaths.playerDbFolder = folderPath;
        updatePathDisplays();
        
        // 設定を自動保存
        try {
          const newConfig = createConfigObject();
          await window.api.updateConfig(newConfig);
          showStatus('プレイヤーDBフォルダを設定し、自動保存しました', 'success');
        } catch (saveError) {
          showStatus('フォルダは設定されましたが、保存に失敗しました: ' + saveError.message, 'error');
        }
      }
    } catch (error) {
      showStatus('フォルダ選択に失敗しました: ' + error.message, 'error');
    }
  });

  document.getElementById('selectSongdata').addEventListener('click', async () => {
    try {
      const path = await window.api.selectDbPath();
      if (path) {
        state.dbPaths.songdata = path;
        updatePathDisplays();
        
        // 設定を自動保存
        try {
          const newConfig = createConfigObject();
          await window.api.updateConfig(newConfig);
          showStatus('songdata.dbを設定し、自動保存しました', 'success');
        } catch (saveError) {
          showStatus('ファイルは設定されましたが、保存に失敗しました: ' + saveError.message, 'error');
        }
      }
    } catch (error) {
      showStatus('ファイル選択に失敗しました: ' + error.message, 'error');
    }
  });

  
  // 難易度表追加ボタン
  const addBtn = document.getElementById('addTableBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      await addTable();
    });
  }

  // config_sys.jsonインポートボタン
  const importBtn = document.getElementById('importConfigBtn');
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      await importFromConfigSys();
    });
  }

  // 一括更新ボタン
  const bulkUpdateBtn = document.getElementById('bulkUpdateTablesBtn');
  if (bulkUpdateBtn) {
    bulkUpdateBtn.addEventListener('click', async () => {
      await bulkUpdateTables();
    });
  }
  
  // フォーム入力フィールドのEnterキー処理
  const formFields = ['tableUrl'];
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
    
    // 更新ボタン
    if (e.target.classList.contains('btn-update') && e.target.hasAttribute('data-original-index')) {
      const originalIndex = parseInt(e.target.getAttribute('data-original-index'));
      if (!isNaN(originalIndex)) {
        await updateTable(originalIndex);
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

// 楽曲情報リンクサービス表示を更新
// Discord設定表示を更新
function updateDiscordDisplay() {
  const discordWebhookUrl = document.getElementById('discordWebhookUrl');
  if (discordWebhookUrl) {
    discordWebhookUrl.value = state.discordWebhookUrl;
    
    // イベントリスナーを追加
    const testBtn = document.getElementById('testDiscordBtn');
    const saveBtn = document.getElementById('saveDiscordBtn');
    
    if (testBtn) {
      testBtn.addEventListener('click', testDiscordConnection);
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', saveDiscordSetting);
    }
  }
}

// Discord接続テスト
async function testDiscordConnection() {
  try {
    const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
    
    if (!webhookUrl) {
      showDiscordStatus('Webhook URLを入力してください', 'error');
      return;
    }
    
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      showDiscordStatus('有効なDiscord Webhook URLを入力してください', 'error');
      return;
    }
    
    showDiscordStatus('接続テスト中...', 'info');
    
    // テストメッセージを送信
    const testMessage = {
      content: '🎵 Beat Archive - Discord連携テスト',
      embeds: [{
        title: '接続テスト成功！',
        description: 'Discord Webhook URLが正しく設定されました。',
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Beat Archive'
        }
      }]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testMessage)
    });
    
    if (response.ok) {
      showDiscordStatus('✅ Discord接続テストが成功しました！', 'success');
    } else {
      const errorText = await response.text();
      showDiscordStatus(`❌ Discord接続テストが失敗しました: ${response.status} - ${errorText}`, 'error');
    }
  } catch (error) {
    showDiscordStatus(`❌ Discord接続テストでエラーが発生しました: ${error.message}`, 'error');
  }
}

// Discord設定を保存
async function saveDiscordSetting() {
  try {
    const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
    state.discordWebhookUrl = webhookUrl;
    
    const config = await window.api.getConfig();
    config.discordWebhookUrl = webhookUrl;
    
    await window.api.updateConfig(config);
    showDiscordStatus('✅ Discord設定を保存しました', 'success');
  } catch (error) {
    showDiscordStatus(`❌ Discord設定の保存に失敗しました: ${error.message}`, 'error');
  }
}

// Discordステータス表示
function showDiscordStatus(message, type) {
  const statusElement = document.getElementById('discordStatus');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  statusElement.style.display = 'block';
  
  // 成功メッセージは3秒後に自動で非表示
  if (type === 'success') {
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
}

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

// ローカル保存機能（無効化）
/*
// 設定された難易度表のローカル保存チェック
async function checkAndCacheDifficultyTables() {
  console.log('難易度表のローカル保存状況をチェック中...');
  
  for (const table of state.difficultyTables) {
    try {
      // キャッシュされているかチェック
      const cacheStatus = await window.api.isDifficultyTableCached(table.url);
      
      if (!cacheStatus.exists) {
        console.log(`${table.name} がローカル保存されていません。保存処理を開始...`);
        showTableStatus(`「${table.name}」をローカル保存中...`, 'info');
        
        // 難易度表データを取得
        const tableData = await window.api.loadDifficultyTable(table.url);
        
        // ローカル保存
        const saveResult = await window.api.saveDifficultyTableLocal(table.url, tableData);
        
        if (saveResult.success) {
          console.log(`${table.name} のローカル保存が完了しました`);
        } else {
          console.error(`${table.name} のローカル保存に失敗:`, saveResult.error);
        }
      } else {
        console.log(`${table.name} は既にローカル保存されています (保存日時: ${cacheStatus.savedAt})`);
      }
    } catch (error) {
      console.error(`${table.name} のローカル保存チェック中にエラー:`, error);
    }
  }
  
  console.log('難易度表のローカル保存チェックが完了しました');
  showTableStatus('難易度表のローカル保存チェックが完了しました', 'success');
}

// 難易度表追加時のローカル保存
async function cacheDifficultyTable(tableUrl, tableName) {
  try {
    showTableStatus(`「${tableName}」をローカル保存中...`, 'info');
    
    // 難易度表データを取得
    const tableData = await window.api.loadDifficultyTable(tableUrl);
    
    // ローカル保存
    const saveResult = await window.api.saveDifficultyTableLocal(tableUrl, tableData);
    
    if (saveResult.success) {
      console.log(`${tableName} のローカル保存が完了しました`);
      showTableStatus(`「${tableName}」のローカル保存が完了しました`, 'success');
    } else {
      console.error(`${tableName} のローカル保存に失敗:`, saveResult.error);
      showTableStatus(`「${tableName}」のローカル保存に失敗しました`, 'error');
    }
  } catch (error) {
    console.error(`${tableName} のローカル保存中にエラー:`, error);
    showTableStatus(`「${tableName}」のローカル保存中にエラーが発生しました`, 'error');
  }
}
*/

// config_sys.jsonから難易度表をインポート
async function importFromConfigSys() {
  try {
    showTableStatus('config_sys.jsonファイルを選択してください...', 'info');
    
    // ファイル選択と読み込み
    const result = await window.api.selectAndReadConfigSys();
    if (!result) {
      showTableStatus('ファイル選択がキャンセルされました', 'info');
      return;
    }
    
    const { tableURLs, filePath } = result;
    
    showTableStatus(`${tableURLs.length}個の難易度表URLを検出しました...`, 'info');
    
    let successCount = 0;
    let skippedCount = 0;
    
    // 各URLを順番に処理
    for (let i = 0; i < tableURLs.length; i++) {
      const url = tableURLs[i];
      
      showTableStatus(`処理中... (${i + 1}/${tableURLs.length}): ${url}`, 'info');
      
      // すでに登録されているかチェック
      const exists = state.difficultyTables.some(table => table.url === url);
      if (exists) {
        console.log(`スキップ（既存）: ${url}`);
        skippedCount++;
        continue;
      }
      
      try {
        // 難易度表データを取得してテーブル名を取得
        const tableData = await window.api.loadDifficultyTable(url);
        
        // ヘッダーから名前を取得（優先順位: header.name -> header.symbol -> URLから推測）
        let tableName = tableData.header?.name || tableData.header?.symbol;
        
        if (!tableName) {
          // ヘッダーから名前が取得できない場合、URLから推測
          tableName = extractTableNameFromUrl(url);
        }
        
        // データをローカルに保存
        let savedHeaderPath = null;
        let savedDataPath = null;
        let urlHash = null;
        
        try {
          const saveResult = await window.api.saveDifficultyTableData(url, tableData.header, tableData.body);
          if (saveResult.success) {
            savedHeaderPath = saveResult.headerPath;
            savedDataPath = saveResult.dataPath;
            urlHash = saveResult.urlHash;
            console.log(`ローカル保存完了: ${tableName}`, saveResult);
          } else {
            console.error(`ローカル保存失敗: ${tableName}`, saveResult.error);
          }
        } catch (saveError) {
          console.error(`ローカル保存中にエラー: ${tableName}`, saveError);
        }
        
        // 新しい難易度表を追加
        const newTable = {
          url: url,
          name: tableName,
          priority: state.difficultyTables.length,
          // ローカル保存されたファイルパス情報
          savedFiles: savedHeaderPath && savedDataPath ? {
            headerPath: savedHeaderPath,
            dataPath: savedDataPath,
            urlHash: urlHash,
            savedAt: new Date().toISOString()
          } : null
        };
        
        state.difficultyTables.push(newTable);
        successCount++;
        
        console.log(`追加成功: ${tableName} (${url})`);
        
      } catch (error) {
        console.error(`テーブル追加エラー (${url}):`, error);
        // エラーでも処理を続行
        
        // URLから名前を推測して追加
        const tableName = extractTableNameFromUrl(url);
        const newTable = {
          url: url,
          name: tableName,
          priority: state.difficultyTables.length,
          savedFiles: null // エラー時はローカル保存情報なし
        };
        
        state.difficultyTables.push(newTable);
        successCount++;
      }
    }
    
    // 設定を保存
    if (successCount > 0) {
      try {
        const newConfig = createConfigObject();
        await window.api.updateConfig(newConfig);
        await updateTableList();
        
        const message = `インポート完了: ${successCount}個追加, ${skippedCount}個スキップ`;
        showTableStatus(message, 'success');
        
      } catch (saveError) {
        showTableStatus(`設定の保存に失敗しました: ${saveError.message}`, 'error');
      }
    } else {
      showTableStatus('新しく追加された難易度表はありませんでした', 'info');
    }
    
  } catch (error) {
    console.error('config_sys.jsonインポートエラー:', error);
    showTableStatus(`インポートエラー: ${error.message}`, 'error');
  }
}

// URLから難易度表の名前を推測する関数
function extractTableNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;
    
    // ドメイン名から推測するパターン
    const domainMap = {
      'stellabms.xyz': 'Stella',
      'miraiscarlet.github.io': 'Genocide',
      'rattoto10.jounin.jp': 'Insane',
      'mocha-repository.info': 'LN',
      'verticalsub.web.fc2.com': 'VerticalSub',
      'fhyu6872.github.io': 'S-ranlovers',
      '867-candy.github.io': 'EATorDIE',
      'lets-go-time-hell.github.io': 'Time Hell',
      'wrench616.github.io': 'Delay',
      'egret9.github.io': 'Scramble'
    };
    
    // ドメイン名による名前の推測
    if (domainMap[hostname]) {
      // パス名からより具体的な名前を取得
      if (pathname.includes('sl')) return 'Stella SL';
      if (pathname.includes('fr')) return 'Stella FR';
      if (pathname.includes('st')) return 'Stella ST';
      if (pathname.includes('rec')) return 'Stella SL Rec';
      if (pathname.includes('genocide')) return 'Genocide Insane';
      if (pathname.includes('insane')) return 'Insane';
      if (pathname.includes('ln')) return 'LN Table';
      if (pathname.includes('ranlovers')) return 'S-ranlovers';
      if (pathname.includes('EATorDIE')) return 'EATorDIE Human';
      if (pathname.includes('Arm-Shougakkou')) return 'Arm Shougakkou';
      if (pathname.includes('code-stream')) return 'Code Stream';
      if (pathname.includes('Delay')) return 'Delay';
      if (pathname.includes('Scramble')) return 'Scramble';
      
      return domainMap[hostname];
    }
    
    // パス名から名前を推測
    const pathParts = pathname.split('/').filter(part => part.length > 0);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // 拡張子を除去
      const nameWithoutExt = lastPart.replace(/\.(html?|json)$/i, '');
      if (nameWithoutExt && nameWithoutExt !== 'table' && nameWithoutExt !== 'index') {
        return nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1);
      }
    }
    
    // 最後の手段: ホスト名を使用
    return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
  } catch (error) {
    console.error('URL解析エラー:', error);
    // URLが不正な場合は、そのまま文字列として処理
    const parts = url.split('/').filter(part => part.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'Unknown Table';
  }
}
