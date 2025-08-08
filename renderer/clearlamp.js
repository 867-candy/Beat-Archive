const state = {
  difficultyTables: [],
  selectedTableData: null,
  selectedTableIndex: -1,
  songs: [],
  selectedLevels: new Set(), // 選択されたレベルのセット
  songSearchText: '', // 楽曲名検索テキスト
  sortColumn: 'level', // ソート対象のカラム (none, level, title, clear, misscount, score, djlevel, scorerate, lastplayed)
  sortDirection: 'asc', // ソート方向 ('asc' または 'desc')
  songLinkService: 'none' // 楽曲リンクサービス設定
};

// 楽曲リンクURL生成関数
async function generateSongUrl(song, linkService) {
  // 特定の楽曲のデバッグ情報を出力
  const isDistanceFields = song.title && song.title.includes('Distance Fields');
  
  if (isDistanceFields) {
    console.log('=== DEBUG: generateSongUrl for Distance Fields ===');
  }
  
  console.log('generateSongUrl called with:', {
    title: song.title,
    linkService: linkService,
    md5: song.md5,
    sha256: song.sha256,
    originalMd5: song.originalMd5,
    originalSha256: song.originalSha256,
    clear: song.clear
  });
  
  if (!linkService || linkService === 'none' || linkService === '') {
    console.log('Link service is none or empty, returning null');
    if (isDistanceFields) {
      console.log('=== Distance Fields: Link service is none or empty ===');
    }
    return null;
  }
  
  // データベースから取得した値を優先し、なければ難易度表のオリジナル値を使用
  const md5 = song.md5 || song.originalMd5;
  let sha256 = song.sha256 || song.originalSha256;
  
  console.log(`Final MD5: ${md5}, Final SHA256: ${sha256} for song: ${song.title}`);
  
  if (isDistanceFields) {
    console.log('Distance Fields final values:', { md5, sha256, linkService });
  }
  
  switch (linkService) {
    case 'lr2ir':
      if (md5) {
        const url = `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${md5}`;
        console.log('Generated LR2IR URL:', url);
        return url;
      } else {
        console.log('No MD5 available for LR2IR');
      }
      break;
    case 'mochair':
      if (isDistanceFields) {
        console.log('=== Distance Fields: Processing MochaIR case ===');
        console.log('Initial SHA256:', sha256, 'Initial MD5:', md5);
      }
      
      // SHA256がない場合、MD5からSHA256への変換を試行
      if (!sha256 && md5) {
        try {
          console.log(`Converting MD5 to SHA256 for MochaIR URL: ${md5} (song: ${song.title})`);
          sha256 = await window.api.convertMd5ToSha256(md5);
          if (sha256) {
            console.log(`Successfully converted MD5 to SHA256 for MochaIR: ${sha256} (song: ${song.title})`);
          } else {
            console.log(`Failed to convert MD5 to SHA256 for MochaIR: ${md5} (song: ${song.title})`);
          }
        } catch (error) {
          console.error(`Error converting MD5 to SHA256 for MochaIR (song: ${song.title}):`, error);
        }
      }
      
      if (isDistanceFields) {
        console.log('Distance Fields after conversion - SHA256:', sha256);
      }
      
      if (sha256) {
        const url = `http://mocha-repository.info/song.php?sha256=${sha256}`;
        console.log('Generated MochaIR URL:', url);
        if (isDistanceFields) {
          console.log('=== Distance Fields: Generated MochaIR URL ===', url);
        }
        return url;
      } else {
        console.log(`No SHA256 available for MochaIR (song: ${song.title})`);
        if (isDistanceFields) {
          console.log('=== Distance Fields: No SHA256 available for MochaIR ===');
        }
      }
      break;
    case 'bms-score-viewer':
      if (md5) {
        const url = `https://bms-score-viewer.pages.dev/view?md5=${md5}`;
        console.log('Generated BMS Score Viewer URL:', url);
        return url;
      } else {
        console.log('No MD5 available for BMS Score Viewer');
      }
      break;
    default:
      console.log('Unknown link service:', linkService);
  }
  
  if (isDistanceFields) {
    console.log('=== Distance Fields: generateSongUrl returning null ===');
  }
  
  console.log('No URL generated, returning null');
  return null;
}

// 初期化
async function initialize() {
  try {
    await loadDifficultyTables();
    await loadSettings();
    setupEventListeners();
  } catch (error) {
    console.error('初期化エラー:', error);
    showError('初期化に失敗しました: ' + error.message);
  }
}

// 設定を読み込み
async function loadSettings() {
  try {
    const config = await window.api.getConfig();
    state.songLinkService = config.songLinkService || 'none';
    console.log('=== Settings loaded ===');
    console.log('Loaded songLinkService setting:', state.songLinkService);
    console.log('Full config:', config);
    console.log('=== End Settings ===');
  } catch (error) {
    console.error('設定の読み込みエラー:', error);
  }
}

// 難易度表を読み込み
async function loadDifficultyTables() {
  try {
    const config = await window.api.getConfig();
    state.difficultyTables = config.difficultyTables || [];
    
    // 優先度順でソート（priority値が小さいほど優先度が高い）
    state.difficultyTables.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    const selectElement = document.getElementById('tableSelect');
    selectElement.innerHTML = '';
    
    if (state.difficultyTables.length === 0) {
      selectElement.innerHTML = '<option value="">難易度表が設定されていません</option>';
      return;
    }
    
    selectElement.innerHTML = '<option value="">難易度表を選択してください</option>';
    
    state.difficultyTables.forEach((table, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = table.name;
      selectElement.appendChild(option);
    });
    
  } catch (error) {
    console.error('難易度表の読み込みエラー:', error);
    document.getElementById('tableSelect').innerHTML = '<option value="">読み込みエラー</option>';
  }
}

// イベントリスナー設定
function setupEventListeners() {
  document.getElementById('tableSelect').addEventListener('change', handleTableChange);
  document.getElementById('levelSelect').addEventListener('change', handleLevelFilterChange);
  document.getElementById('songSearch').addEventListener('input', handleSongSearchChange);
}

// 難易度表選択変更時の処理
async function handleTableChange(event) {
  const selectedIndex = parseInt(event.target.value);
  
  if (isNaN(selectedIndex) || selectedIndex < 0) {
    resetDisplay();
    return;
  }
  
  state.selectedTableIndex = selectedIndex;
  const selectedTable = state.difficultyTables[selectedIndex];
  
  // ソートを難易度でリセット
  state.sortColumn = 'level';
  state.sortDirection = 'asc';
  
  console.log('=== 難易度表選択変更 ===');
  console.log('選択された表:', selectedTable);
  
  showLoading();
  
  try {
    console.log('ステップ1: 難易度表データ読み込み');
    await loadTableData(selectedTable);
    
    console.log('ステップ2: 楽曲スコア読み込み');
    await loadSongScores();
    
    console.log('ステップ3: 表示更新');
    await updateDisplay();
    
    console.log('=== 難易度表読み込み完了 ===');
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    showError('データの読み込みに失敗しました: ' + error.message);
  }
}

// レベルフィルタ変更時の処理
async function handleLevelFilterChange(event) {
  const selectedValue = event.target.value;
  state.selectedLevels.clear();
  
  if (selectedValue === 'all' || selectedValue === '') {
    // 全て表示の場合は全レベルを選択
    const allLevels = [...new Set(state.songs.map(song => song.level.toString()))];
    allLevels.forEach(level => state.selectedLevels.add(level));
  } else {
    // 特定レベルのみ選択
    state.selectedLevels.add(selectedValue);
  }
  
  await updateSongTable();
}

// 楽曲名検索変更時の処理
async function handleSongSearchChange(event) {
  state.songSearchText = event.target.value.toLowerCase();
  await updateSongTable();
}

// 難易度表データを読み込み
async function loadTableData(table) {
  try {
    console.log('Loading table:', table);
    const data = await window.api.loadDifficultyTable(table.url);
    console.log('Loaded table data:', data);
    console.log('Table data structure check:', {
      hasHeader: !!data.header,
      hasBody: !!data.body,
      bodyType: typeof data.body,
      bodyIsArray: Array.isArray(data.body),
      bodyLength: data.body ? data.body.length : 'N/A'
    });

    // header の level_order を詳しく調べる
    console.log('=== Header Level Order Debug ===');
    if (data.header && data.header.level_order) {
      console.log('level_order exists:', data.header.level_order);
      console.log('level_order type:', typeof data.header.level_order);
      console.log('level_order length:', data.header.level_order.length);
      console.log('First 10 level_order items:', data.header.level_order.slice(0, 10));
    } else {
      console.log('No level_order found in header');
      console.log('Header keys:', Object.keys(data.header || {}));
    }
    console.log('===============================');
    
    // 美食研究会の場合の特別処理
    if (table.name === '美食研究会') {
      console.log('美食研究会データの詳細確認:', {
        firstElement: data.body?.[0],
        elementKeys: data.body?.[0] ? Object.keys(data.body[0]) : []
      });
    }
    
    state.selectedTableData = data;
  } catch (error) {
    console.error('Table loading error:', error);
    throw new Error('難易度表データの読み込みに失敗しました');
  }
}

// 楽曲スコアを読み込み
async function loadSongScores() {
  try {
    console.log('=== loadSongScores 開始 ===');
    
    if (!state.selectedTableData || !state.selectedTableData.body) {
      console.log('No table data or body available');
      state.songs = [];
      return;
    }
    
    console.log('Selected table data:', state.selectedTableData);
    console.log('Table body structure:', {
      isArray: Array.isArray(state.selectedTableData.body),
      length: state.selectedTableData.body.length,
      firstItem: state.selectedTableData.body[0]
    });
    
    const songs = [];
    
    // データが楽曲のフラットなリストの場合
    if (Array.isArray(state.selectedTableData.body)) {
      console.log(`Processing ${state.selectedTableData.body.length} songs from flat list`);
      
      // Overjoyの場合、最初の数個の楽曲データを詳しく確認
      if (state.selectedTableData.body.length > 0) {
        console.log('First 3 songs data structure:', state.selectedTableData.body.slice(0, 3));
      }
      
      for (let index = 0; index < state.selectedTableData.body.length; index++) {
        const song = state.selectedTableData.body[index];
        if (!song || (!song.sha256 && !song.md5)) {
          console.log('Skipping song without sha256 or md5:', song);
          continue;
        }
        
        try {
          // SHA256またはMD5でスコア情報を取得
          const hashValue = song.sha256 || song.md5;
          const hashType = song.sha256 ? 'sha256' : 'md5';
          console.log(`Getting score for ${hashType}: ${hashValue}`);
          
          const scoreData = await window.api.getSongScore(hashValue);
          console.log(`Score data for ${song.title}:`, scoreData);
          
          // 基本的なシンボル情報を使用
          const currentSymbol = state.selectedTableData.header?.symbol || '';
          const displaySymbol = currentSymbol ? `${currentSymbol}${song.level || ''}` : (song.level || '');
          
          // SHA256が存在しない場合はMD5から変換を試行
          let convertedSha256 = song.sha256;
          if (!convertedSha256 && song.md5) {
            try {
              console.log(`Converting MD5 to SHA256 for ${song.title}: ${song.md5}`);
              convertedSha256 = await window.api.convertMd5ToSha256(song.md5);
              if (convertedSha256) {
                console.log(`Successfully converted for ${song.title}: ${convertedSha256}`);
              }
            } catch (error) {
              console.error(`Error converting MD5 to SHA256 for ${song.title}:`, error);
            }
          }
          
          // レベル情報のデバッグ
          if (song.level === undefined || song.level === null || song.level === '?') {
            console.log(`Level issue found for song: ${song.title}`, {
              rawLevel: song.level,
              hasLevel: 'level' in song,
              songKeys: Object.keys(song),
              fullSong: song
            });
          }
          
          // URL生成
          const tempSong = {
            md5: song.md5,
            sha256: convertedSha256,
            originalMd5: song.md5,
            originalSha256: convertedSha256 || song.sha256,
            title: song.title || '[unknown]'
          };
          
          // 特定の楽曲のデバッグ情報を出力
          if (song.title && song.title.includes('Distance Fields')) {
            console.log('=== DEBUG: Distance Fields Data Creation ===');
            console.log('Original song data:', {
              title: song.title,
              md5: song.md5,
              sha256: song.sha256,
              level: song.level,
              clear: scoreData ? scoreData.clear : -1
            });
            console.log('TempSong for URL generation:', tempSong);
            console.log('Link service:', state.songLinkService);
            console.log('=== END DEBUG ===');
          }
          
          console.log(`Generating URL for song: ${tempSong.title}, service: ${state.songLinkService}, MD5: ${tempSong.md5}, SHA256: ${tempSong.sha256}, originalSHA256: ${tempSong.originalSha256}`);
          const cachedUrl = await generateSongUrl(tempSong, state.songLinkService);
          console.log(`Generated cached URL for ${tempSong.title}: ${cachedUrl}`);
          
          songs.push({
            level: song.level !== undefined && song.level !== null ? song.level : '?',
            title: song.title || '[unknown]',
            md5: song.md5, // MD5ハッシュ値
            sha256: convertedSha256, // 変換されたSHA256（元のSHA256または変換結果）
            originalMd5: song.md5, // 難易度表のオリジナルMD5
            originalSha256: convertedSha256 || song.sha256, // 変換済みSHA256または元のSHA256
            url_diff: song.url_diff || '',
            symbol: displaySymbol, // 難易度表のシンボル情報
            score: scoreData ? scoreData.score : null,
            clear: scoreData ? scoreData.clear : -1, // scoreDataが取得できない場合はNO SONG(-1)
            rank: scoreData ? scoreData.rank : '',
            percentage: scoreData ? scoreData.percentage : 0,
            points: scoreData ? scoreData.points : 0,
            minbp: scoreData ? scoreData.minbp : null, // ミスカウント
            djLevel: scoreData ? scoreData.djLevel : 'F', // DJ LEVEL
            beatorajaScore: scoreData ? scoreData.beatorajaScore : 0, // beatorajaスコアレート
            lastPlayed: scoreData ? scoreData.lastPlayed : null, // 最終プレイ
            cachedUrl: cachedUrl, // 事前生成されたURL
            originalIndex: index // 元の順序を保持
          });
        } catch (scoreError) {
          console.error(`Error getting score for ${song.title}:`, scoreError);
          // エラーが発生してもスコア情報なしで楽曲を追加
          const currentSymbol = state.selectedTableData.header?.symbol || '';
          const fallbackSymbol = currentSymbol ? `${currentSymbol}${song.level || ''}` : (song.level || '');
          
          // SHA256が存在しない場合はMD5から変換を試行（エラー時も実行）
          let convertedSha256 = song.sha256;
          if (!convertedSha256 && song.md5) {
            try {
              console.log(`Converting MD5 to SHA256 for ${song.title} (error fallback): ${song.md5}`);
              convertedSha256 = await window.api.convertMd5ToSha256(song.md5);
              if (convertedSha256) {
                console.log(`Successfully converted for ${song.title} (error fallback): ${convertedSha256}`);
              }
            } catch (error) {
              console.error(`Error converting MD5 to SHA256 for ${song.title} (error fallback):`, error);
            }
          }
          
          // URL生成
          const tempSong2 = {
            md5: song.md5,
            sha256: convertedSha256,
            originalMd5: song.md5,
            originalSha256: convertedSha256 || song.sha256,
            title: song.title || '[unknown]'
          };
          const cachedUrl2 = await generateSongUrl(tempSong2, state.songLinkService);
          
          songs.push({
            level: song.level || '?',
            title: song.title || '[unknown]',
            md5: song.md5, // MD5ハッシュ値
            sha256: convertedSha256, // 変換されたSHA256（元のSHA256または変換結果）
            originalMd5: song.md5, // 難易度表のオリジナルMD5
            originalSha256: convertedSha256 || song.sha256, // 変換済みSHA256または元のSHA256
            url_diff: song.url_diff || '',
            symbol: fallbackSymbol, // フォールバック用シンボル情報
            score: null,
            clear: -1, // エラー時はNO SONGとして扱う
            rank: '',
            percentage: 0,
            points: 0,
            minbp: null, // ミスカウント
            djLevel: 'F', // DJ LEVEL
            beatorajaScore: 0, // beatorajaスコアレート
            lastPlayed: null, // 最終プレイ
            cachedUrl: cachedUrl2, // 事前生成されたURL
            originalIndex: index
          });
        }
      }
    } else {
      // データがレベル別にグループ化されている場合（従来の処理）
      console.log('Processing level-grouped data');
      let globalIndex = 0; // 全体でのインデックス
      
      // level_orderの順序でレベルを処理
      const levelOrder = state.selectedTableData.header?.level_order || [];
      const bodyLevels = state.selectedTableData.body || [];
      
      console.log('=== Level Order Debug ===');
      console.log('level_order:', levelOrder);
      console.log('Available levels in body:', bodyLevels.map(level => level.level || level.name));
      console.log('========================');
      
      // level_orderがある場合はその順序で処理
      if (levelOrder.length > 0) {
        for (const levelName of levelOrder) {
          const levelData = bodyLevels.find(level => 
            (level.level || level.name) === levelName
          );
          
          if (levelData && levelData.songs && Array.isArray(levelData.songs)) {
            console.log(`Found ${levelData.songs.length} songs in level ${levelName}`);
            for (const song of levelData.songs) {
              if (!song || (!song.sha256 && !song.md5)) {
                console.log('Skipping song without sha256 or md5:', song);
                globalIndex++;
                continue;
              }
              
              // SHA256またはMD5でスコア情報を取得
              const hashValue = song.sha256 || song.md5;
              const hashType = song.sha256 ? 'sha256' : 'md5';
              console.log(`Getting score for ${hashType}: ${hashValue}`);
              
              const scoreData = await window.api.getSongScore(hashValue);
              console.log(`Score data for ${song.title}:`, scoreData);
              
              // SHA256が存在しない場合はMD5から変換を試行
              let convertedSha256 = song.sha256;
              if (!convertedSha256 && song.md5) {
                try {
                  console.log(`Converting MD5 to SHA256 for ${song.title}: ${song.md5}`);
                  convertedSha256 = await window.api.convertMd5ToSha256(song.md5);
                  if (convertedSha256) {
                    console.log(`Successfully converted for ${song.title}: ${convertedSha256}`);
                  }
                } catch (error) {
                  console.error(`Error converting MD5 to SHA256 for ${song.title}:`, error);
                }
              }
              
              // URL生成
              const tempSong3 = {
                md5: song.md5,
                sha256: convertedSha256,
                originalMd5: song.md5,
                originalSha256: convertedSha256 || song.sha256,
                title: song.title || '[unknown]'
              };
              const cachedUrl3 = await generateSongUrl(tempSong3, state.songLinkService);
              
              songs.push({
                level: levelName,
                title: song.title || '[unknown]',
                md5: song.md5, // MD5ハッシュ値
                sha256: convertedSha256, // 変換されたSHA256（元のSHA256または変換結果）
                originalMd5: song.md5, // 難易度表のオリジナルMD5
                originalSha256: convertedSha256 || song.sha256, // 変換済みSHA256または元のSHA256
                url_diff: song.url_diff || '',
                symbol: song.symbol || null,
                score: scoreData ? scoreData.score : null,
                clear: scoreData ? scoreData.clear : -1, // scoreDataが取得できない場合はNO SONG(-1)
                rank: scoreData ? scoreData.rank : '',
                percentage: scoreData ? scoreData.percentage : 0,
                points: scoreData ? scoreData.points : 0,
                minbp: scoreData ? scoreData.minbp : null,
                djLevel: scoreData ? scoreData.djLevel : 'F',
                beatorajaScore: scoreData ? scoreData.beatorajaScore : 0,
                lastPlayed: scoreData ? scoreData.lastPlayed : null,
                cachedUrl: cachedUrl3, // 事前生成されたURL
                originalIndex: globalIndex // 元の順序を保持
              });
              globalIndex++;
            }
          }
        }
      } else {
        // level_orderがない場合は元の処理
        for (const levelData of bodyLevels) {
          console.log('Processing level data:', levelData);
          const level = levelData.level || levelData.name || '?';
          
          if (levelData.songs && Array.isArray(levelData.songs)) {
            console.log(`Found ${levelData.songs.length} songs in level ${level}`);
            for (const song of levelData.songs) {
              if (!song || (!song.sha256 && !song.md5)) {
                console.log('Skipping song without sha256 or md5:', song);
                globalIndex++;
                continue;
              }
              
              // SHA256またはMD5でスコア情報を取得
              const hashValue = song.sha256 || song.md5;
              const hashType = song.sha256 ? 'sha256' : 'md5';
              console.log(`Getting score for ${hashType}: ${hashValue}`);
              
              const scoreData = await window.api.getSongScore(hashValue);
              console.log(`Score data for ${song.title}:`, scoreData);
              
              // SHA256が存在しない場合はMD5から変換を試行
              let convertedSha256 = song.sha256;
              if (!convertedSha256 && song.md5) {
                try {
                  console.log(`Converting MD5 to SHA256 for ${song.title}: ${song.md5}`);
                  convertedSha256 = await window.api.convertMd5ToSha256(song.md5);
                  if (convertedSha256) {
                    console.log(`Successfully converted for ${song.title}: ${convertedSha256}`);
                  }
                } catch (error) {
                  console.error(`Error converting MD5 to SHA256 for ${song.title}:`, error);
                }
              }
              
              // URL生成
              const tempSong4 = {
                md5: song.md5,
                sha256: convertedSha256,
                originalMd5: song.md5,
                originalSha256: convertedSha256 || song.sha256,
                title: song.title || '[unknown]'
              };
              const cachedUrl4 = await generateSongUrl(tempSong4, state.songLinkService);
              
              songs.push({
                level: level,
                title: song.title || '[unknown]',
                md5: song.md5, // MD5ハッシュ値
                sha256: convertedSha256, // 変換されたSHA256（元のSHA256または変換結果）
                originalMd5: song.md5, // 難易度表のオリジナルMD5
                originalSha256: convertedSha256 || song.sha256, // 変換済みSHA256または元のSHA256
                url_diff: song.url_diff || '',
                symbol: song.symbol || null,
                score: scoreData ? scoreData.score : null,
                clear: scoreData ? scoreData.clear : -1, // scoreDataが取得できない場合はNO SONG(-1)
                rank: scoreData ? scoreData.rank : '',
                percentage: scoreData ? scoreData.percentage : 0,
                points: scoreData ? scoreData.points : 0,
                minbp: scoreData ? scoreData.minbp : null,
                djLevel: scoreData ? scoreData.djLevel : 'F',
                beatorajaScore: scoreData ? scoreData.beatorajaScore : 0,
                lastPlayed: scoreData ? scoreData.lastPlayed : null,
                cachedUrl: cachedUrl4, // 事前生成されたURL
                originalIndex: globalIndex // 元の順序を保持
              });
              globalIndex++;
            }
          } else {
            console.log('No songs array found in level data:', levelData);
          }
        }
      }
    }
    
    console.log(`Total songs loaded: ${songs.length}`);
    
    // デバッグ: 最初の10曲の順序を確認
    console.log('=== Song Order Debug ===');
    songs.slice(0, 15).forEach((song, index) => {
      console.log(`${index}: originalIndex=${song.originalIndex}, level=${song.level}, title=${song.title}`);
    });
    console.log('========================');
    
    state.songs = songs;
    console.log('State.songs after setting:', state.songs.length);
    console.log('First few songs:', state.songs.slice(0, 3));
    console.log('=== loadSongScores 完了 ===');
  } catch (error) {
    console.error('楽曲スコア読み込みエラー:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    state.songs = [];
    throw error; // エラーを再スローして上位に伝える
  }
}

// 表示を更新
async function updateDisplay() {
  console.log('=== updateDisplay 開始 ===');
  updateStats();
  updateChart();
  await updateSongTable();
  await createLevelDropdown();
  console.log('=== updateDisplay 完了 ===');
}

// 統計情報を更新
function updateStats() {
  console.log('=== updateStats 開始 ===');
  console.log('state.songs length:', state.songs ? state.songs.length : 'undefined');
  
  const totalSongs = state.songs.length;
  const availableSongs = state.songs.filter(song => song.clear >= 0).length; // NO SONGを除外
  const playedSongs = state.songs.filter(song => song.clear > 0).length;
  const clearedSongs = state.songs.filter(song => song.clear >= 2).length; // EASY以上
  const hardClearedSongs = state.songs.filter(song => song.clear >= 5).length; // HARD以上
  
  console.log('Statistics calculated:', {
    totalSongs,
    availableSongs,
    playedSongs,
    clearedSongs,
    hardClearedSongs
  });
  
  document.getElementById('totalSongs').textContent = totalSongs;
  document.getElementById('playedSongs').textContent = playedSongs;
  document.getElementById('clearRate').textContent = availableSongs > 0 ? Math.round((clearedSongs / availableSongs) * 100) + '%' : '0%';
  document.getElementById('hardClearRate').textContent = availableSongs > 0 ? Math.round((hardClearedSongs / availableSongs) * 100) + '%' : '0%';
  
  console.log('=== updateStats 完了 ===');
}

// チャートを更新（SVG横向き棒グラフ）
function updateChart() {
  const chartContainer = document.getElementById('chartContainer');
  
  // レベル別にグループ化
  const levelGroups = {};
  state.songs.forEach(song => {
    if (!levelGroups[song.level]) {
      levelGroups[song.level] = [];
    }
    levelGroups[song.level].push(song);
  });
  
  const levels = Object.keys(levelGroups).sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b);
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
  });
  
  if (levels.length === 0) {
    chartContainer.innerHTML = '<div class="chart-placeholder">データがありません</div>';
    return;
  }
  
  // チャートの設定（横向きに調整）
  const chartWidth = 800;
  const barHeight = 12; // 固定のバー高さ（半分に縮小）
  const barSpacing = 18; // バー間のスペース（半分に縮小）
  const margin = { top: 40, right: 80, bottom: 60, left: 80 };
  const plotWidth = chartWidth - margin.left - margin.right;
  
  // 実際のコンテンツサイズに基づいて高さを計算
  const contentHeight = levels.length * barSpacing;
  const chartHeight = margin.top + contentHeight + margin.bottom;
  const plotHeight = contentHeight;
  
  // クリアタイプの色設定
  const clearColors = {
    '-1': '#ffffff', // NO SONG - 白色
    0: '#f3f4f6', // NO PLAY - グレー
    1: '#99a1af', // FAILED - 暗いグレー
    2: '#ad46ff', // ASSIST EASY CLEAR - 紫
    3: '#ad46ff', // LIGHT ASSIST CLEAR - 紫（ASSIST EASY CLEARと同じ色）
    4: '#7bf1a8', // EASY CLEAR - 青
    5: '#51a2ff', // CLEAR - 緑
    6: '#ffa2a2', // HARD CLEAR - 赤
    7: '#ffd230', // EX HARD CLEAR - 黄
    8: '#66E7F8', // FULL COMBO - シアン
    9: '#85FAC0', // PERFECT - 緑系
    10: '#F3E8FF'  // MAX - 薄紫
  };
  
  const clearLabels = {
    '-1': 'NO SONG',
    0: 'NO PLAY',
    1: 'FAILED', 
    2: 'ASSIST EASY CLEAR',
    3: 'ASSIST EASY CLEAR', // LIGHT ASSIST CLEARをASSIST EASY CLEARと同じラベルに
    4: 'EASY CLEAR',
    5: 'CLEAR',
    6: 'HARD CLEAR',
    7: 'EX HARD CLEAR',
    8: 'FULL COMBO',
    9: 'PERFECT', // PERFECT
    10: 'MAX' // MAX
  };
  
  // 最大楽曲数を取得（各バーを100%の長さに統一）
  const maxBarWidth = plotWidth; // グラフの横幅を下のメモリと揃える
  
  // SVG作成
  let svgHtml = `
    <svg class="chart-svg" width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}" style="width: 100%; height: 100%;">
      <defs>
        <clipPath id="chart-clip">
          <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
        </clipPath>
      </defs>
  `;
  
  // X軸の描画（横向きなので下部）
  const lastElementY = margin.top + (levels.length - 1) * barSpacing + (barSpacing - barHeight) / 2 + barHeight;
  svgHtml += `
    <g class="x-axis">
      <line x1="${margin.left}" y1="${lastElementY + 10}" x2="${margin.left + plotWidth}" y2="${lastElementY + 10}" stroke="#666" stroke-width="1"></line>
  `;
  
  // X軸の目盛り（パーセンテージ）
  for (let i = 0; i <= 10; i++) {
    const x = margin.left + (i / 10) * plotWidth;
    const value = i * 10;
    svgHtml += `
      <line x1="${x}" y1="${lastElementY + 10}" x2="${x}" y2="${lastElementY + 15}" stroke="#666" stroke-width="1"></line>
      <text x="${x}" y="${lastElementY + 30}" text-anchor="middle" fill="#666" font-size="10">${value}%</text>
    `;
  }
  svgHtml += `</g>`;
  
  // Y軸の描画（左側）
  svgHtml += `
    <g class="y-axis">
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${lastElementY + 10}" stroke="#666" stroke-width="1"></line>
  `;
  
  // 各レベルの横向き棒グラフを描画
  levels.forEach((level, index) => {
    const songs = levelGroups[level];
    const totalSongs = songs.length;
    const y = margin.top + index * barSpacing + (barSpacing - barHeight) / 2;
    
    // レベルのシンボル情報を取得（headerから取得）
    const levelSymbol = state.selectedTableData?.header?.symbol || null;
    
    // クリアタイプ別の統計を計算
    const clearStats = {};
    for (let clearType = -1; clearType <= 10; clearType++) { // -1から10に拡張
      clearStats[clearType] = songs.filter(song => song.clear === clearType).length;
    }
    
    // 積み上げ横棒グラフの描画（高い順から低い順に）
    let currentX = margin.left;
    for (let clearType = 10; clearType >= -1; clearType--) { // 10から-1に逆順
      const count = clearStats[clearType];
      if (count > 0 && totalSongs > 0) {
        const percentage = count / totalSongs;
        const width = percentage * maxBarWidth;
        
        svgHtml += `
          <rect x="${currentX}" y="${y}" width="${width}" height="${barHeight}" 
                fill="${clearColors[clearType]}" stroke="#fff" stroke-width="0.5"
                data-level="${level}" data-clear="${clearType}" data-count="${count}">
            <title>${level} - ${clearLabels[clearType]}: ${count}曲 (${(percentage * 100).toFixed(1)}%)</title>
          </rect>
        `;
        
        currentX += width;
      }
    }
    
    // Y軸ラベル（レベル名とシンボル）
    const displayText = levelSymbol ? `${levelSymbol}${level}` : level;
    svgHtml += `
      <text x="${margin.left - 10}" y="${y + barHeight/2 + 4}" 
            text-anchor="end" fill="#666" font-size="12" font-weight="bold">${displayText}</text>
    `;
    
    // 楽曲数を右側に表示
    svgHtml += `
      <text x="${margin.left + plotWidth + 10}" y="${y + barHeight/2 + 4}" 
            text-anchor="start" fill="#999" font-size="10">${totalSongs}曲</text>
    `;
  });
  
  svgHtml += `</g>`;
  
  // グラフタイトル
  const tableName = state.selectedTableIndex >= 0 ? state.difficultyTables[state.selectedTableIndex].name : '';
  svgHtml += `
    <text x="${chartWidth/2}" y="25" text-anchor="middle" fill="#2c3e50" font-size="14" font-weight="bold">
      レベル別クリア状況 ${tableName ? `- ${tableName}` : ''} (総楽曲数: ${state.songs.length})
    </text>
  `;
  
  // X軸ラベル
  svgHtml += `
    <text x="${chartWidth/2}" y="${chartHeight - 10}" text-anchor="middle" fill="#666" font-size="12">
      クリア率 (%)
    </text>
  `;
  
  svgHtml += `</svg>`;
  
  chartContainer.innerHTML = svgHtml;
  
  // ホバーイベントを追加
  const rects = chartContainer.querySelectorAll('rect[data-level]');
  rects.forEach(rect => {
    rect.addEventListener('mouseenter', function(e) {
      this.style.opacity = '0.8';
      this.style.cursor = 'pointer';
    });
    
    rect.addEventListener('mouseleave', function(e) {
      this.style.opacity = '1';
    });
  });
}

// 楽曲テーブルを更新
async function updateSongTable() {
  const container = document.getElementById('tableContainer');
  
  // テーブルタイトルを更新
  const tableTitleElement = document.querySelector('.table-title');
  if (tableTitleElement) {
    const tableName = state.selectedTableIndex >= 0 ? state.difficultyTables[state.selectedTableIndex].name : '';
    tableTitleElement.textContent = tableName ? `楽曲別クリア状況 - ${tableName}` : '楽曲別クリア状況';
  }
  
  if (state.songs.length === 0) {
    container.innerHTML = '<div class="no-data">楽曲データが見つかりません</div>';
    return;
  }
  
  // ソート処理
  const sortedSongs = getSortedSongs();
  
  // 全楽曲のURL生成を並列で実行
  const songsWithUrls = await Promise.all(
    sortedSongs.map(async (song) => {
      const songUrl = await generateSongUrl(song, state.songLinkService);
      
      // 特定の楽曲のデバッグ情報を出力
      if (song.title && song.title.includes('Distance Fields')) {
        console.log('=== DEBUG: Distance Fields URL Generation ===');
        console.log('Song data:', {
          title: song.title,
          md5: song.md5,
          sha256: song.sha256,
          originalMd5: song.originalMd5,
          originalSha256: song.originalSha256,
          clear: song.clear,
          linkService: state.songLinkService
        });
        console.log('Generated URL:', songUrl);
        console.log('=== END DEBUG ===');
      }
      
      return { ...song, cachedUrl: songUrl };
    })
  );
  
  let tableHtml = `
    <table class="song-table">
      <thead>
        <tr>
          <th class="level-cell sortable ${state.sortColumn === 'level' ? 'sorted-' + state.sortDirection : ''}" data-column="level">
            レベル
          </th>
          <th class="song-title sortable ${state.sortColumn === 'title' ? 'sorted-' + state.sortDirection : ''}" data-column="title">
            曲名
          </th>
          <th class="clear-cell sortable ${state.sortColumn === 'clear' ? 'sorted-' + state.sortDirection : ''}" data-column="clear">
            クリア
          </th>
          <th class="misscount-cell sortable ${state.sortColumn === 'misscount' ? 'sorted-' + state.sortDirection : ''}" data-column="misscount">
            MISS
          </th>
          <th class="score-cell sortable ${state.sortColumn === 'score' ? 'sorted-' + state.sortDirection : ''}" data-column="score">スコア</th>
          <th class="djlevel-cell sortable ${state.sortColumn === 'djlevel' ? 'sorted-' + state.sortDirection : ''}" data-column="djlevel">
           ランク
          </th>
          <th class="scorerate-cell sortable ${state.sortColumn === 'scorerate' ? 'sorted-' + state.sortDirection : ''}" data-column="scorerate">
            レート
          </th>
          <th class="lastplayed-cell sortable ${state.sortColumn === 'lastplayed' ? 'sorted-' + state.sortDirection : ''}" data-column="lastplayed">
            最終プレイ
          </th>
        </tr>
      </thead>
      <tbody>
  `;
  
  for (const song of songsWithUrls) {
    // レベルフィルタリング
    if (!state.selectedLevels.has(song.level.toString())) {
      continue;
    }

    // 楽曲名検索フィルタリング
    if (state.songSearchText && !song.title.toLowerCase().includes(state.songSearchText)) {
      continue;
    }

    const clearType = song.clear !== undefined ? song.clear : 0;
    const missCount = song.minbp !== null ? song.minbp : '-'; // 実際のミスカウントを表示、null/undefinedの場合は'-'
    const score = song.score || 0;
    const djLevel = song.djLevel || 'F';
    const beatorajaScore = song.beatorajaScore !== null ? song.beatorajaScore.toFixed(2) + '%' : '-';
    const lastPlayed = song.lastPlayed ? new Date(song.lastPlayed * 1000).toLocaleDateString('ja-JP') : '-';
    const clearClass = getClearClass(clearType);
    
    // レベル表示用のシンボル取得
    const levelSymbol = state.selectedTableData?.header?.symbol || null;
    const displayLevel = levelSymbol ? `${levelSymbol}${song.level}` : song.level.toString();
    
    // 楽曲リンクURL（既に生成済み）
    const songUrl = song.cachedUrl || null;
    
    tableHtml += `
      <tr class="${clearClass}">
        <td class="level-cell">${escapeHtml(displayLevel)}</td>
        <td class="song-title">
          ${songUrl ? 
            `<a href="#" data-url="${escapeHtml(songUrl)}" class="song-link">${escapeHtml(song.title)}</a>` :
            escapeHtml(song.title)
          }
        </td>
        <td class="clear-cell">${escapeHtml(getClearTypeName(clearType))}</td>
        <td class="misscount-cell">${missCount}</td>
        <td class="score-cell">${score.toLocaleString()}</td>
        <td class="djlevel-cell">${escapeHtml(djLevel)}</td>
        <td class="scorerate-cell">${beatorajaScore}</td>
        <td class="lastplayed-cell">${lastPlayed}</td>
      </tr>
    `;
  }
  
  tableHtml += '</tbody></table>';
  container.innerHTML = tableHtml;
  
  // ソート用のイベントリスナーを追加
  setupSortEventListeners();
  
  // 楽曲リンクのイベントリスナーを追加
  setupSongLinkEventListeners();
}

// クリアタイプからCSSクラスを取得
function getClearClass(clearType) {
  switch (clearType) {
    case -1: return 'clear-nosong';
    case 0: return 'clear-noplay';
    case 1: return 'clear-failed';
    case 2: return 'clear-assist';
    case 3: return 'clear-assist'; // LIGHT ASSIST CLEARもASSIST EASY CLEARと同じクラス
    case 4: return 'clear-easy';
    case 5: return 'clear-normal';
    case 6: return 'clear-hard';
    case 7: return 'clear-exhard';
    case 8: return 'clear-fullcombo';
    case 9: return 'clear-perfect'; // PERFECT
    case 10: return 'clear-max'; // MAX
    default: return 'clear-nosong';
  }
}

// クリアタイプ名を取得
function getClearTypeName(clearType) {
  const clearLabels = {
    '-1': 'NO SONG',
    0: 'NO PLAY',
    1: 'FAILED', 
    2: 'ASSIST',
    3: 'ASSIST',
    4: 'EASY',
    5: 'CLEAR',
    6: 'HARD',
    7: 'EX HARD',
    8: 'FULL COMBO',
    9: 'PERFECT', // PERFECT
    10: 'MAX' // MAX
  };
  return clearLabels[clearType] || 'UNKNOWN';
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ローディング表示
function showLoading() {
  document.getElementById('tableContainer').innerHTML = '<div class="loading">データを読み込み中...</div>';
  document.getElementById('chartContainer').innerHTML = '<div class="loading">データを読み込み中...</div>';
}

// エラー表示
function showError(message) {
  document.getElementById('tableContainer').innerHTML = `<div class="no-data">エラー: ${escapeHtml(message)}</div>`;
  document.getElementById('chartContainer').innerHTML = `<div class="no-data">エラー: ${escapeHtml(message)}</div>`;
}

// 表示をリセット
function resetDisplay() {
  document.getElementById('totalSongs').textContent = '-';
  document.getElementById('playedSongs').textContent = '-';
  document.getElementById('clearRate').textContent = '-';
  document.getElementById('hardClearRate').textContent = '-';
  
  document.getElementById('chartContainer').innerHTML = '<div class="chart-placeholder">難易度表を選択してください</div>';
  document.getElementById('tableContainer').innerHTML = '<div class="loading">難易度表を選択してください</div>';
  
  // ソートをリセット（難易度ソートに初期化）
  state.sortColumn = 'level';
  state.sortDirection = 'asc';
  
  // レベルフィルタもリセット
  const levelSelect = document.getElementById('levelSelect');
  if (levelSelect) {
    levelSelect.innerHTML = '<option value="">難易度表を選択してください</option>';
  }
  state.selectedLevels.clear();
  
  // 楽曲名検索もリセット
  const songSearch = document.getElementById('songSearch');
  if (songSearch) {
    songSearch.value = '';
  }
  state.songSearchText = '';
}

// 初期化実行
initialize();

// ソート済みの楽曲リストを取得
function getSortedSongs() {
  const songs = [...state.songs];
  
  console.log(`=== Sort Debug: sortColumn=${state.sortColumn}, sortDirection=${state.sortDirection} ===`);
  
  songs.sort((a, b) => {
    let compareValue = 0;
    
    switch (state.sortColumn) {
      case 'none':
        // 元の順序（originalIndex）
        compareValue = (a.originalIndex || 0) - (b.originalIndex || 0);
        break;
        
      case 'level':
        // レベルソート：まず数値レベル、次に特殊レベル
        const levelA = a.level;
        const levelB = b.level;
        
        // 数値レベルかどうかを判定
        const isNumericA = !isNaN(parseInt(levelA));
        const isNumericB = !isNaN(parseInt(levelB));
        
        if (isNumericA && isNumericB) {
          // 両方数値の場合
          compareValue = parseInt(levelA) - parseInt(levelB);
        } else if (isNumericA && !isNumericB) {
          // Aが数値、Bが特殊レベルの場合、数値を先に
          compareValue = -1;
        } else if (!isNumericA && isNumericB) {
          // Aが特殊レベル、Bが数値の場合、数値を先に
          compareValue = 1;
        } else {
          // 両方特殊レベルの場合、文字列比較
          compareValue = levelA.localeCompare(levelB, 'ja');
        }
        break;
        
      case 'title':
        // 曲名でソート（文字列比較）
        compareValue = a.title.localeCompare(b.title, 'ja');
        break;
        
      case 'clear':
        compareValue = (a.clear || 0) - (b.clear || 0);
        break;
        
      case 'misscount':
        // ミスカウントは数値として比較、nullは最大値として扱う
        const missA = a.minbp !== null ? a.minbp : 999999;
        const missB = b.minbp !== null ? b.minbp : 999999;
        compareValue = missA - missB;
        break;
        
      case 'score':
        // スコアは数値として比較、nullは0として扱う
        const scoreA = a.beatorajaScore ? parseFloat(a.beatorajaScore) : 0;
        const scoreB = b.beatorajaScore ? parseFloat(b.beatorajaScore) : 0;
        compareValue = scoreA - scoreB;
        break;
        
      case 'djlevel':
        // DJ LEVEL順序定義
        const djLevelOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'AA', 'AAA'];
        const djLevelA = djLevelOrder.indexOf(a.djLevel || 'F');
        const djLevelB = djLevelOrder.indexOf(b.djLevel || 'F');
        compareValue = djLevelA - djLevelB;
        break;
        
      case 'scorerate':
        const scoreRateA = a.beatorajaScore || 0;
        const scoreRateB = b.beatorajaScore || 0;
        compareValue = scoreRateA - scoreRateB;
        break;
        
      case 'lastplayed':
        const lastPlayedA = a.lastPlayed || 0;
        const lastPlayedB = b.lastPlayed || 0;
        compareValue = lastPlayedA - lastPlayedB;
        break;
        
      default:
        // デフォルトは元の順序（originalIndex）
        compareValue = (a.originalIndex || 0) - (b.originalIndex || 0);
        break;
    }
    
    // 降順の場合は符号を反転
    if (state.sortDirection === 'desc') {
      compareValue = -compareValue;
    }
    
    // 同じ値の場合は楽曲タイトルでソート（安定ソート）
    if (compareValue === 0) {
      return a.title.localeCompare(b.title);
    }
    
    return compareValue;
  });
  
  // デバッグ: ソート結果の最初の10曲を確認
  if (state.sortColumn === 'none') {
    console.log('=== Sorted Result Debug (first 15) ===');
    songs.slice(0, 15).forEach((song, index) => {
      console.log(`${index}: originalIndex=${song.originalIndex}, level=${song.level}, title=${song.title}`);
    });
    console.log('=====================================');
  }
  
  return songs;
}

// ソートイベントリスナーを設定
function setupSortEventListeners() {
  const sortableHeaders = document.querySelectorAll('.sortable');
  
  sortableHeaders.forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', async function() {
      const column = this.getAttribute('data-column');
      
      // 同じカラムをクリックした場合は方向を反転、異なるカラムの場合は昇順から開始
      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
      }
      
      console.log(`Sort by ${column} (${state.sortDirection})`);
      await updateSongTable();
    });
    
    // ツールチップの追加
    header.title = 'クリックでソート';
  });
}

// 楽曲リンクのイベントリスナーを設定
function setupSongLinkEventListeners() {
  const songLinks = document.querySelectorAll('.song-link');
  
  songLinks.forEach(link => {
    link.addEventListener('click', async function(e) {
      e.preventDefault();
      const url = this.getAttribute('data-url');
      
      if (url) {
        try {
          const result = await window.api.openExternal(url);
          if (!result.success) {
            console.error('Failed to open URL:', result.error);
            // フォールバックとして通常のリンクとして開く
            window.open(url, '_blank');
          }
        } catch (error) {
          console.error('Error opening external URL:', error);
          // フォールバックとして通常のリンクとして開く
          window.open(url, '_blank');
        }
      }
    });
    
    // ホバー効果のため
    link.style.cursor = 'pointer';
  });
}

// レベルプルダウンメニューを作成
async function createLevelDropdown() {
  const selectElement = document.getElementById('levelSelect');
  if (!selectElement) return;

  // 既存のオプションをクリア
  selectElement.innerHTML = '';

  // すべてのレベルを収集してソート
  const allLevels = [...new Set(state.songs.map(song => song.level.toString()))];
  allLevels.sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    
    // 両方とも数値の場合は数値比較
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    // 片方が数値でない場合は文字列比較で後ろに
    if (isNaN(numA) && !isNaN(numB)) return 1;
    if (!isNaN(numA) && isNaN(numB)) return -1;
    // 両方とも数値でない場合は文字列比較
    return a.localeCompare(b);
  });

  // デフォルトで全レベルを選択状態にする
  state.selectedLevels.clear();
  allLevels.forEach(level => state.selectedLevels.add(level));

  // 「全て表示」オプションを最初に追加
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = '全て表示';
  allOption.selected = true; // デフォルトで選択
  selectElement.appendChild(allOption);

  // 各レベルのオプションを作成
  const levelSymbol = state.selectedTableData?.header?.symbol || null;
  allLevels.forEach(level => {
    const option = document.createElement('option');
    option.value = level;
    // シンボルがある場合は表示に含める
    const displayText = levelSymbol ? `${levelSymbol}${level}` : level;
    option.textContent = displayText;
    selectElement.appendChild(option);
  });
  
  // テーブルを更新（全て表示状態で）
  await updateSongTable();
}
