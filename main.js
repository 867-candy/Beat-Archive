const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const https = require('https');
const http = require('http');

// 難易度表データのキャッシュ
let difficultyTablesCache = null;
let difficultyTablesLastUpdated = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30分

// HTTP/HTTPSリクエスト関数（リダイレクト対応）
function fetchJson(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    try {
      const client = url.startsWith('https:') ? https : http;
      console.log(`Fetching JSON from: ${url}`);
      
      // User-Agentとリファラーを設定してアクセス制限を回避
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
          'DNT': '1',
          'Connection': 'keep-alive',
        }
      };
      
      client.get(url, options, (res) => {
        console.log(`Response status: ${res.statusCode}`);
        
        // リダイレクトのハンドリング
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            console.log(`Redirecting to: ${redirectUrl}`);
            // 相対URLの場合は絶対URLに変換
            const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href;
            return fetchJson(fullRedirectUrl, maxRedirects - 1).then(resolve).catch(reject);
          }
        }
        
        // Google Scripts特有の処理：404でHTMLが返される場合はリダイレクト試行
        if (res.statusCode === 404 && (url.includes('script.googleusercontent.com') || url.includes('script.google.com'))) {
          console.log('Google Scripts 404 detected, checking for redirect pattern...');
          res.setEncoding('utf8');
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            // HTMLからリダイレクトURLを抽出を試行
            const redirectMatch = data.match(/content="0;url=([^"]+)"/i) || 
                                data.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                data.match(/location\.replace\(["']([^"']+)["']\)/i);
            
            if (redirectMatch) {
              const redirectUrl = redirectMatch[1];
              console.log(`Found redirect URL in HTML: ${redirectUrl}`);
              return fetchJson(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
            }
            
            // リダイレクトURLが見つからない場合は元のエラーとして扱う
            reject(new Error(`Google Scripts returned 404 with HTML for ${url}. Response: ${data.substring(0, 100)}...`));
          });
          return;
        }
        
        // 文字エンコーディングを正しく設定
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            // BOM（Byte Order Mark）を除去
            if (data.charCodeAt(0) === 0xFEFF) {
              data = data.slice(1);
            }
            
            // HTMLが返された場合のチェック
            if (data.trim().startsWith('<')) {
              reject(new Error(`HTML response received instead of JSON for ${url}. Response: ${data.substring(0, 100)}...`));
              return;
            }
            
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error for ${url}: ${e.message}`));
          }
        });
      }).on('error', (error) => {
        console.log(`HTTP request error: ${error.message}`);
        reject(error);
      });
    } catch (error) {
      console.log(`fetchJson error: ${error.message}`);
      reject(error);
    }
  });
}

// HTMLページを取得する関数
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    try {
      const client = url.startsWith('https:') ? https : http;
      console.log(`Fetching HTML from: ${url}`);
      
      // User-Agentとリファラーを設定してアクセス制限を回避
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      };
      
      client.get(url, options, (res) => {
        console.log(`HTML response status: ${res.statusCode}`);
        
        // リダイレクトのハンドリング
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            console.log(`HTML redirecting to: ${redirectUrl}`);
            const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href;
            return fetchHtml(fullRedirectUrl).then(resolve).catch(reject);
          }
        }
        
        // Google Scripts特有の処理：404でHTMLが返される場合はリダイレクト試行
        if (res.statusCode === 404 && (url.includes('script.googleusercontent.com') || url.includes('script.google.com'))) {
          console.log('Google Scripts HTML 404 detected, checking for redirect pattern...');
          res.setEncoding('utf8');
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            // HTMLからリダイレクトURLを抽出を試行
            const redirectMatch = data.match(/content="0;url=([^"]+)"/i) || 
                                data.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                data.match(/location\.replace\(["']([^"']+)["']\)/i);
            
            if (redirectMatch) {
              const redirectUrl = redirectMatch[1];
              console.log(`Found redirect URL in HTML: ${redirectUrl}`);
              return fetchHtml(redirectUrl).then(resolve).catch(reject);
            }
            
            // リダイレクトURLが見つからない場合は通常のHTMLとして処理
            console.log(`HTML response length: ${data.length} characters`);
            console.log(`HTML start: ${data.substring(0, 200)}...`);
            resolve(data);
          });
          return;
        }
        
        // 文字エンコーディングを正しく設定
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log(`HTML response length: ${data.length} characters`);
          console.log(`HTML start: ${data.substring(0, 200)}...`);
          resolve(data);
        });
      }).on('error', (error) => {
        console.log(`HTML request error: ${error.message}`);
        reject(error);
      });
    } catch (error) {
      console.log(`fetchHtml error: ${error.message}`);
      reject(error);
    }
  });
}

// HTMLからbmstableメタタグを解析してJSONのURLを取得
// Google Scripts URLからスクリプトIDを抽出するヘルパー関数
function extractScriptId(url) {
  // lib= パラメータからスクリプトIDを抽出
  const libMatch = url.match(/lib=([^&]+)/);
  if (libMatch) {
    return libMatch[1];
  }
  
  // user_content_keyからの抽出（フォールバック）
  const keyMatch = url.match(/user_content_key=([^&]+)/);
  if (keyMatch) {
    // 簡易的なハッシュ生成（実際のスクリプトIDではないが、一意性を保つ）
    return keyMatch[1].substring(0, 26); // スクリプトIDは通常26文字
  }
  
  return 'unknown';
}

function extractJsonUrlFromHtml(html, baseUrl) {
  // HTMLが空またはnullの場合は、ディレクトリURLとして扱い header.json を推測
  if (!html || html.trim().length === 0) {
    console.log(`Empty HTML content, assuming directory URL and trying header.json`);
    return constructJsonUrl('header.json', baseUrl);
  }
  
  // パターン1: bmstable meta tag
  const metaMatch = html.match(/<meta\s+name="bmstable"\s+content="([^"]+)"\s*\/?>/i);
  if (metaMatch) {
    const headerPath = metaMatch[1];
    console.log(`Found bmstable content: ${headerPath}`);
    
    // contentが完全なURLか（http/httpsで始まる）相対パスかを判定
    if (headerPath.startsWith('http://') || headerPath.startsWith('https://')) {
      console.log(`bmstable content is a complete URL: ${headerPath}`);
      return headerPath; // そのまま返す
    } else {
      console.log(`bmstable content is a relative path: ${headerPath}`);
      return constructJsonUrl(headerPath, baseUrl);
    }
  }
  
  // パターン2: header.json への直接リンク
  const headerLinkMatch = html.match(/<a[^>]+href="([^"]*header\.json[^"]*)"[^>]*>/i);
  if (headerLinkMatch) {
    const headerPath = headerLinkMatch[1];
    console.log(`Found header.json link: ${headerPath}`);
    return constructJsonUrl(headerPath, baseUrl);
  }
  
  // パターン3: script tag内での header.json 参照
  const scriptHeaderMatch = html.match(/["']([^"']*header\.json[^"']*)["']/i);
  if (scriptHeaderMatch) {
    const headerPath = scriptHeaderMatch[1];
    console.log(`Found header.json in script: ${headerPath}`);
    return constructJsonUrl(headerPath, baseUrl);
  }
  
  // パターン4: 404やエラーページが返された場合、ディレクトリURLとして header.json を推測
  if (html.includes('404') || html.includes('Not Found') || html.includes('Error')) {
    console.log(`Error page detected, assuming directory URL and trying header.json`);
    return constructJsonUrl('header.json', baseUrl);
  }
  
  // パターン5: ディレクトリリスティングページの場合、header.json を推測
  if (html.includes('Index of') || html.includes('Directory listing')) {
    console.log(`Directory listing detected, trying header.json`);
    return constructJsonUrl('header.json', baseUrl);
  }
  
  // パターン6: 一般的なファイル名パターンを推測
  const commonHeaderPatterns = [
    'header.json',
    'table.json',
    'index.json',
    'data/header.json',
    'json/header.json'
  ];
  
  console.log(`No explicit header reference found, trying common patterns...`);
  // 最初のパターンを返す（後でfetchで検証される）
  return constructJsonUrl(commonHeaderPatterns[0], baseUrl);
}

// JSONのURLを構築するヘルパー関数
function constructJsonUrl(headerPath, baseUrl) {
  try {
    const base = new URL(baseUrl);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Base origin: ${base.origin}`);
    console.log(`Base pathname: ${base.pathname}`);
    
    // 相対パスの場合、ベースURLのディレクトリ部分と結合
    const basePath = base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/\/[^\/]*$/, '/');
    console.log(`Base path: ${basePath}`);
    
    const jsonUrl = new URL(headerPath, base.origin + basePath);
    console.log(`Constructed JSON URL: ${jsonUrl.toString()}`);
    
    return jsonUrl.toString();
  } catch (error) {
    console.log(`URL construction failed: ${error.message}`);
    // URL構築に失敗した場合は単純な文字列結合を試す
    const baseDir = baseUrl.replace(/\/[^\/]*$/, '/');
    const fallbackUrl = baseDir + headerPath;
    console.log(`Fallback URL: ${fallbackUrl}`);
    return fallbackUrl;
  }
}

// 難易度表データを取得
async function loadDifficultyTables(config) {
  const now = Date.now();
  
  // キャッシュが有効な場合は再利用
  if (difficultyTablesCache && (now - difficultyTablesLastUpdated) < CACHE_DURATION) {
    return difficultyTablesCache;
  }
  
  const tables = [];
  
  for (const tableConfig of config.difficultyTables || []) {
    try {
      console.log(`Loading difficulty table: ${tableConfig.name} from ${tableConfig.url}`);
      
      let headerUrl = tableConfig.url;
      let header;
      
      // URLが直接JSONファイルを指しているかチェック
      if (tableConfig.url.endsWith('.json')) {
        console.log('Direct JSON URL detected');
        headerUrl = tableConfig.url;
        header = await fetchJson(headerUrl);
      } else if (tableConfig.url.endsWith('/')) {
        // ディレクトリURLの場合、header.jsonを自動補完
        console.log('Directory URL detected, trying header.json');
        headerUrl = tableConfig.url + 'header.json';
        
        try {
          header = await fetchJson(headerUrl);
          console.log('Header loaded successfully from auto-completed URL');
        } catch (autoError) {
          console.log(`Auto-completion failed: ${autoError.message}, falling back to HTML parsing`);
          // HTMLページの場合の処理にフォールバック
          const html = await fetchHtml(tableConfig.url);
          headerUrl = extractJsonUrlFromHtml(html, tableConfig.url);
          console.log(`Extracted JSON URL from HTML: ${headerUrl}`);
          
          // ヘッダー情報を取得（複数パターンを試行）
          const headerPatterns = [
            headerUrl,
            constructJsonUrl('header.json', tableConfig.url),
            constructJsonUrl('table.json', tableConfig.url),
            constructJsonUrl('index.json', tableConfig.url),
            constructJsonUrl('data/header.json', tableConfig.url),
            constructJsonUrl('json/header.json', tableConfig.url)
          ];
          
          for (const headerPattern of headerPatterns) {
            try {
              console.log(`Trying header URL: ${headerPattern}`);
              header = await fetchJson(headerPattern);
              console.log('Header loaded successfully. Name:', header.name || 'Unknown', 'Symbol:', header.symbol || 'N/A', 'Data URL:', header.data_url);
              headerUrl = headerPattern; // 成功したURLを記録
              break;
            } catch (headerError) {
              console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
              if (headerPattern === headerPatterns[headerPatterns.length - 1]) {
                // 最後のパターンでも失敗した場合
                throw new Error(`Could not find valid header file for ${tableConfig.name}. Tried: ${headerPatterns.join(', ')}`);
              }
              continue;
            }
          }
          
          if (!header) {
            throw new Error(`Failed to load header for ${tableConfig.name} from any pattern`);
          }
        }
      } else {
        // HTMLページの場合、metaタグからJSONのURLを抽出
        const html = await fetchHtml(tableConfig.url);
        headerUrl = extractJsonUrlFromHtml(html, tableConfig.url);
        console.log(`Extracted JSON URL from HTML: ${headerUrl}`);
        
        // ヘッダー情報を取得（複数パターンを試行）
        const headerPatterns = [
          headerUrl,
          constructJsonUrl('header.json', tableConfig.url),
          constructJsonUrl('table.json', tableConfig.url),
          constructJsonUrl('index.json', tableConfig.url),
          constructJsonUrl('data/header.json', tableConfig.url),
          constructJsonUrl('json/header.json', tableConfig.url)
        ];
        
        for (const headerPattern of headerPatterns) {
          try {
            console.log(`Trying header URL: ${headerPattern}`);
            header = await fetchJson(headerPattern);
            console.log('Header loaded successfully. Name:', header.name || 'Unknown', 'Symbol:', header.symbol || 'N/A', 'Data URL:', header.data_url);
            headerUrl = headerPattern; // 成功したURLを記録
            break;
          } catch (headerError) {
            console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
            if (headerPattern === headerPatterns[headerPatterns.length - 1]) {
              // 最後のパターンでも失敗した場合
              throw new Error(`Could not find valid header file for ${tableConfig.name}. Tried: ${headerPatterns.join(', ')}`);
            }
            continue;
          }
        }
        
        if (!header) {
          throw new Error(`Failed to load header for ${tableConfig.name} from any pattern`);
        }
      }
      console.log(`Header loaded successfully. Name: ${header.name}, Symbol: ${header.symbol}, Data URL: ${header.data_url}`);
      
      // データ部を取得
      const dataUrl = header.data_url;
      console.log(`Fetching data from: ${dataUrl}`);
      
      // data_urlが相対パスの場合、ベースURLと結合
      let fullDataUrl = dataUrl;
      if (!dataUrl.startsWith('http://') && !dataUrl.startsWith('https://')) {
        try {
          const base = new URL(headerUrl);
          fullDataUrl = new URL(dataUrl, base.origin + base.pathname.replace(/\/[^\/]*$/, '/')).toString();
          console.log(`Converted relative data URL to: ${fullDataUrl}`);
        } catch (error) {
          console.log(`Data URL conversion failed: ${error.message}`);
          // フォールバック：単純な文字列結合
          const baseDir = headerUrl.replace(/\/[^\/]*$/, '/');
          fullDataUrl = baseDir + dataUrl.replace('./', '');
          console.log(`Fallback data URL: ${fullDataUrl}`);
        }
      }
      
      // データを取得（Google Scriptsの場合は複数パターンを試行）
      let data;
      if (fullDataUrl.includes('script.google') || fullDataUrl.includes('script.googleusercontent.com')) {
        console.log('Google Scripts URL detected, trying multiple patterns...');
        
        // Google ScriptsのURLパターンを複数試行
        const scriptId = extractScriptId(fullDataUrl);
        const googlePatternsToTry = [
          fullDataUrl, // 元のURL
          fullDataUrl.replace('script.googleusercontent.com', 'script.google.com'), // スクリプトURLに変更
          fullDataUrl.replace('script.google.com', 'script.googleusercontent.com'), // ユーザーコンテンツURLに変更
          // exec形式への変換を試行
          fullDataUrl.replace(/macros\/echo\?.*/, 'macros/s/' + scriptId + '/exec'),
          // Web app形式への変換を試行
          `https://script.google.com/macros/s/${scriptId}/exec`,
          `https://script.googleusercontent.com/macros/s/${scriptId}/exec`,
          // Dev形式も試行
          `https://script.google.com/macros/s/${scriptId}/dev`
        ];
        
        // 重複を除去
        const uniquePatterns = [...new Set(googlePatternsToTry)];
        
        for (const googleUrl of uniquePatterns) {
          try {
            console.log(`Trying Google Scripts URL: ${googleUrl}`);
            data = await fetchJson(googleUrl);
            console.log(`Successfully fetched data from: ${googleUrl}`);
            break;
          } catch (googleError) {
            console.log(`Failed to fetch from ${googleUrl}: ${googleError.message}`);
            if (googleUrl === uniquePatterns[uniquePatterns.length - 1]) {
              throw new Error(`Failed to fetch Google Scripts data from all patterns: ${uniquePatterns.join(', ')}`);
            }
            continue;
          }
        }
      } else {
        // 通常のURL
        data = await fetchJson(fullDataUrl);
      }
      
      tables.push({
        ...tableConfig,
        header,
        data,
        symbol: header.symbol || '',
        levelOrder: header.level_order || []
      });
      
    } catch (error) {
      console.warn(`Failed to load difficulty table ${tableConfig.name}:`, error.message);
    }
  }
  
  // 優先順位でソート
  tables.sort((a, b) => a.priority - b.priority);
  
  difficultyTablesCache = tables;
  difficultyTablesLastUpdated = now;
  
  return tables;
}

// 譜面のmd5/sha256から難易度表情報を検索（最高優先度のみ）
function findChartInTables(tables, md5, sha256) {
  for (const table of tables) {
    for (const chart of table.data) {
      if ((md5 && chart.md5 === md5) || (sha256 && chart.sha256 === sha256)) {
        return {
          table,
          chart,
          symbol: table.symbol,
          level: chart.level,
          levelOrder: table.levelOrder
        };
      }
    }
  }
  return null;
}

// 譜面のmd5/sha256から全ての難易度表情報を検索（複数の表にまたがる場合）
function findAllChartsInTables(tables, md5, sha256) {
  const results = [];
  for (const table of tables) {
    for (const chart of table.data) {
      if ((md5 && chart.md5 === md5) || (sha256 && chart.sha256 === sha256)) {
        results.push({
          table,
          chart,
          symbol: table.symbol,
          level: chart.level,
          levelOrder: table.levelOrder,
          priority: table.priority
        });
      }
    }
  }
  return results;
}

// 統合された楽曲リストを生成（重複排除・優先度ソート）
function createIntegratedSongList(songData, difficultyTables) {
  const songMap = new Map();
  
  // 各楽曲について難易度表情報を収集
  for (const song of songData) {
    const tableInfos = findAllChartsInTables(difficultyTables, song.md5, song.sha256);
    
    if (tableInfos.length > 0) {
      // 優先度でソート（priority値が小さいほど高優先度）
      tableInfos.sort((a, b) => a.priority - b.priority);
      
      // 最高優先度の表の情報をメインとして使用
      const primaryTable = tableInfos[0];
      
      // 複数表に登録されている場合、全てのシンボルを収集
      const symbols = tableInfos.map(info => {
        const symbol = info.symbol || '';
        const level = info.level || '';
        return symbol ? `${symbol}${level}` : level;
      }).filter(s => s);
      
      const enhancedSong = {
        ...song,
        tableSymbol: symbols.join(' '),
        tableLevel: primaryTable.level,
        tableName: primaryTable.table.name,
        levelOrderIndex: getLevelOrderIndex(primaryTable.level, primaryTable.levelOrder),
        priority: primaryTable.priority,
        hasMultipleTables: tableInfos.length > 1
      };
      
      songMap.set(song.sha256, enhancedSong);
    } else {
      // 難易度表に含まれない楽曲
      songMap.set(song.sha256, {
        ...song,
        tableSymbol: '',
        tableLevel: '',
        tableName: '',
        levelOrderIndex: 999,
        priority: 999,
        hasMultipleTables: false
      });
    }
  }
  
  return Array.from(songMap.values());
}

// レベル順序を数値化（ソート用）
function getLevelOrderIndex(level, levelOrder) {
  if (!levelOrder || levelOrder.length === 0) {
    // デフォルトの数値ソート
    const numLevel = parseFloat(level);
    return isNaN(numLevel) ? 999 : numLevel;
  }
  
  const index = levelOrder.indexOf(level);
  return index >= 0 ? index : levelOrder.length + parseFloat(level) || 999;
}

// scorelogから当日の差分記録を取得する関数
async function calculateDailyBestUpdates(sha256, targetDate, scorelogDB, scorelogTableName, song) {
  try {
    if (isDevelopment) {
      console.log(`[DEBUG] scorelog差分計算開始: SHA256=${sha256.substring(0, 8)}..., 日付=${targetDate.format('YYYY-MM-DD')}`);
    }
    
    const start = targetDate.startOf('day').unix();
    const end = targetDate.endOf('day').unix();
    
    // scorelogから指定日の更新記録を全て取得（スコア更新時のみ記録される）
    const todayUpdates = await new Promise((resolve, reject) => {
      scorelogDB.all(
        `SELECT mode, clear, oldclear, score, oldscore, 
                combo, oldcombo, minbp, oldminbp, date
         FROM ${scorelogTableName} 
         WHERE sha256 = ? AND date BETWEEN ? AND ? 
         ORDER BY date ASC`,
        [sha256, start, end],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            if (isDevelopment && rows.length > 0) {
              console.log(`[DEBUG] ${sha256.substring(0, 8)}...: 当日更新記録=${rows.length}件`);
            }
            resolve(rows);
          }
        }
      );
    });
    
    if (todayUpdates.length === 0) {
      if (isDevelopment) {
        console.log(`[DEBUG] ${sha256.substring(0, 8)}...: 指定日に更新記録なし`);
      }
      return [];
    }
    
    const updates = [];
    
    // 各更新記録を処理
    for (const update of todayUpdates) {
      const scoreDiff = update.score - update.oldscore;
      const missDiff = update.oldminbp - update.minbp;  // 正の値でMISS減少
      const clearDiff = update.clear - update.oldclear;
      const comboDiff = update.combo - update.oldcombo;
      
      if (isDevelopment) {
        console.log(`[DEBUG] ${sha256.substring(0, 8)}...: 差分詳細 - スコア:${scoreDiff}, MISS:${missDiff}, クリア:${clearDiff}, コンボ:${comboDiff}`);
      }
      
      // 初回プレイ判定（oldscore=0 または oldminbp=2147483647）
      const isFirstPlay = update.oldscore === 0 || update.oldminbp === 2147483647;
      
      if (isFirstPlay) {
        // 初回プレイの場合、初期値からの差分として複数の更新を記録
        let firstPlayUpdates = [];
        
        // スコア改善（0から現在のスコアへ）
        if (update.score > 0) {
          firstPlayUpdates.push({
            type: 'daily_score',
            diff: update.score,
            newValue: update.score,
            oldValue: 0,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
        }
        
        // MISS改善（初期値999999から現在のMISSへ）
        if (update.minbp < 999999) {
          // 楽曲のノーツ数から実際のMISSを減算した値を計算
          let missImprovement = 999999 - update.minbp;
          
          // 楽曲情報があれば、ノーツ数を使って改善数を調整
          if (song && song.notes && typeof song.notes === 'number' && song.notes > 0) {
            // ノーツ数 - 実際のMISS数 = 改善されたノーツ数
            missImprovement = song.notes - update.minbp;
          }
          
          firstPlayUpdates.push({
            type: 'daily_miss',
            diff: missImprovement,
            newValue: update.minbp,
            oldValue: 999999,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
        }
        
        // クリア改善（NO PLAY=0から現在のクリアへ）
        if (update.clear > 0) {
          firstPlayUpdates.push({
            type: 'daily_clear',
            diff: update.clear,
            newValue: update.clear,
            oldValue: 0,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
        }
        
        // 初回プレイマーカー
        firstPlayUpdates.push({
          type: 'daily_first_play',
          diff: update.score,
          newValue: update.score,
          oldValue: 0,
          clearType: update.clear,
          miss: update.minbp,
          combo: update.combo
        });
        
        updates.push(...firstPlayUpdates);
        
        if (isDevelopment) {
          // 楽曲情報があれば、ノーツ数を使って改善数を計算
          let missImprovement = 999999 - update.minbp;
          if (song && song.notes && typeof song.notes === 'number' && song.notes > 0) {
            missImprovement = song.notes - update.minbp;
          }
          console.log(`[DEBUG] ${sha256.substring(0, 8)}...: 初回プレイ - スコア=${update.score}, MISS改善=${missImprovement}, クリア=${update.clear}`);
        }
      } else {
        // 更新記録の処理（改善があった場合のみ記録）
        let hasAnyImprovement = false;
        
        // スコア改善（+の場合のみ）
        if (scoreDiff > 0) {
          updates.push({
            type: 'daily_score',
            diff: scoreDiff,
            newValue: update.score,
            oldValue: update.oldscore,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
          hasAnyImprovement = true;
          
          if (isDevelopment) {
            console.log(`[DEBUG] ${sha256.substring(0, 8)}...: スコア改善 +${scoreDiff} (${update.oldscore} → ${update.score})`);
          }
        }
        
        // MISS改善（減少した場合のみ）
        if (missDiff > 0 && update.oldminbp < 2147483647 && update.minbp < 999999) {
          updates.push({
            type: 'daily_miss',
            diff: missDiff,
            newValue: update.minbp,
            oldValue: update.oldminbp,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
          hasAnyImprovement = true;
          
          if (isDevelopment) {
            console.log(`[DEBUG] ${sha256.substring(0, 8)}...: MISS改善 -${missDiff} (${update.oldminbp} → ${update.minbp})`);
          }
        }
        
        // クリア改善（増加した場合のみ）
        if (clearDiff > 0) {
          updates.push({
            type: 'daily_clear',
            diff: clearDiff,
            newValue: update.clear,
            oldValue: update.oldclear,
            clearType: update.clear,
            miss: update.minbp,
            combo: update.combo
          });
          hasAnyImprovement = true;
          
          if (isDevelopment) {
            console.log(`[DEBUG] ${sha256.substring(0, 8)}...: クリア改善 +${clearDiff} (${update.oldclear} → ${update.clear})`);
          }
        }
        
        // 改善がなかった場合はデバッグログを出力
        if (!hasAnyImprovement && isDevelopment) {
          console.log(`[DEBUG] ${sha256.substring(0, 8)}...: プレイしたが改善なし - スコア:${scoreDiff}, MISS:${missDiff}, クリア:${clearDiff}, コンボ:${comboDiff}`);
        }
      }
    }
    return updates;
    
  } catch (error) {
    console.error(`差分計算エラー (SHA256: ${sha256}):`, error);
    return [];
  }
}

// クリアタイプの定義
const CLEAR_TYPES = {
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
  10: 'MAX',
};

function getClearTypeName(clearType) {
  return CLEAR_TYPES[clearType] || `UNKNOWN(${clearType})`;
}

// beatorajaのスコアを計算する関数
function calculateScore(scoreData) {
  if (!scoreData) return 0;
  
  // beatorajaのスコア計算方式
  const { epg = 0, lpg = 0, egr = 0, lgr = 0, egd = 0, lgd = 0, notes = 0 } = scoreData;
  
  if (notes === 0) return 0;
  
  // スコア = (EXCELLENT PG * 2 + LATE PG * 2 + EXCELLENT GR * 1 + LATE GR * 1) / (notes * 2) * 100
  const totalScore = (epg * 2 + lpg * 2 + egr * 1 + lgr * 1);
  const maxScore = notes * 2;
  
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
}

// DJ LEVEL関連の共通定数と関数
const DJ_LEVEL_THRESHOLDS = {
  'AAA': 8/9,   // 88.89%
  'AA': 7/9,    // 77.78%
  'A': 6/9,     // 66.67%
  'B': 5/9,     // 55.56%
  'C': 4/9,     // 44.44%
  'D': 3/9,     // 33.33%
  'E': 2/9,     // 22.22%
  'F': 0        // 0%
};

const DJ_LEVEL_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'AA', 'AAA'];

// EXスコアとパーセンテージを計算する共通関数
function calculateScoreAndPercentage(scoreData, notes) {
  if (!scoreData || !notes || notes === 0) {
    return { exScore: 0, percentage: 0, maxScore: 0 };
  }
  
  const { epg = 0, lpg = 0, egr = 0, lgr = 0 } = scoreData;
  const exScore = (epg + lpg) * 2 + (egr + lgr) * 1;
  const maxScore = notes * 2;
  const percentage = maxScore > 0 ? (exScore / maxScore) * 100 : 0;
  
  return { exScore, percentage, maxScore };
}

// パーセンテージからDJ LEVELを計算する共通関数
function getDjLevelFromPercentage(percentage) {
  const ratio = percentage / 100;
  
  for (const [level, threshold] of Object.entries(DJ_LEVEL_THRESHOLDS)) {
    if (ratio >= threshold) {
      return level;
    }
  }
  return 'F';
}

// SCORE仕様に基づくスコア計算（IIDX仕様）
function calculateIIDXScore(scoreData) {
  if (!scoreData) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  const { notes = 0 } = scoreData;
  if (notes === 0) return { score: 0, maxScore: 0, djLevel: 'F' };
  
  const { exScore, percentage, maxScore } = calculateScoreAndPercentage(scoreData, notes);
  const djLevel = getDjLevelFromPercentage(percentage);
  
  return { score: exScore, maxScore, djLevel };
}

// 次のDJ LEVELまでの必要点数を計算
function calculateNextDjLevelPoints(currentScore, maxScore, currentDjLevel) {
  // 現在のDJ LEVELのインデックスを取得
  const currentIndex = DJ_LEVEL_ORDER.indexOf(currentDjLevel);
  
  // 次のレベルがある場合
  if (currentIndex >= 0 && currentIndex < DJ_LEVEL_ORDER.length - 1) {
    const nextLevel = DJ_LEVEL_ORDER[currentIndex + 1];
    const requiredRatio = DJ_LEVEL_THRESHOLDS[nextLevel];
    
    if (requiredRatio !== undefined) {
      const requiredScore = Math.ceil(requiredRatio * maxScore);
      const pointsNeeded = requiredScore - currentScore;
      
      return {
        nextLevel: nextLevel,
        pointsNeeded: Math.max(0, pointsNeeded),
        requiredRate: requiredRatio * 100
      };
    }
  }
  
  // 最高レベル（AAA）に到達している場合
  return {
    nextLevel: null,
    pointsNeeded: 0,
    requiredRate: 100
  };
}

// DJレベルポイントを計算
function calculateDjLevelPoints(scoreData, songData) {
  if (!scoreData || !songData || !songData.notes) {
    return 0;
  }
  
  const { percentage } = calculateScoreAndPercentage(scoreData, songData.notes);
  
  // DJレベルに基づいてポイントを計算
  if (percentage >= 88.89) return songData.notes; // AAA
  if (percentage >= 77.78) return Math.floor(songData.notes * 0.8); // AA
  if (percentage >= 66.67) return Math.floor(songData.notes * 0.6); // A
  if (percentage >= 55.56) return Math.floor(songData.notes * 0.4); // B
  if (percentage >= 44.44) return Math.floor(songData.notes * 0.2); // C
  if (percentage >= 33.33) return Math.floor(songData.notes * 0.1); // D
  return 0; // E, F
}

// ランクを計算（DJ LEVELと同じロジック）
function calculateRank(percentage) {
  return getDjLevelFromPercentage(percentage);
}

// DJ LEVELを計算（ランクと同じロジック）
function calculateDjLevel(percentage) {
  return getDjLevelFromPercentage(percentage);
}

let configPath = path.join(app.getPath('userData'), 'config.json');
let localDbPath = path.join(app.getPath('userData'), 'local-data.db');

// サンプルDBのパス
const sampleDbPath = path.join(__dirname, 'sample-db');

// デバッグ用：開発環境での設定
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

if (isDevelopment) {
  localDbPath = path.join(__dirname, 'local-data.db');
  // 開発環境でも常にユーザーデータディレクトリを使用
  console.log('開発環境: ユーザーデータディレクトリを使用:', app.getPath('userData'));
}

let config = {
  dbPaths: {
    score: '',
    scorelog: '',
    scoredatalog: '',
    songdata: ''
  }
};

function loadConfig() {
  console.log('設定ファイルの読み込みを開始:', configPath);
  
  // 既存の設定ファイルがある場合は、それを優先して読み込み
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath));
      console.log('既存の設定ファイルを読み込みました:', configPath);
      return;
    } catch (error) {
      console.error('設定ファイルの読み込みでエラーが発生しました:', error);
      // 破損している場合は削除して初期化処理に進む
      try {
        fs.unlinkSync(configPath);
        console.log('破損した設定ファイルを削除しました');
      } catch (deleteError) {
        console.error('設定ファイル削除でエラー:', deleteError);
      }
    }
  }
  
  // 設定ファイルが存在しない場合の初期化処理
  console.log('設定ファイルが見つかりません。初期設定を作成します:', configPath);
  
  // ビルド環境の場合：config-build.jsonがあれば初期設定として使用
  if (!isDevelopment) {
    const buildConfigPath = path.join(__dirname, 'config-build.json');
    if (fs.existsSync(buildConfigPath)) {
      try {
        const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath));
        config = buildConfig;
        console.log('config-build.jsonから初期設定を読み込みました');
      } catch (error) {
        console.error('config-build.jsonの読み込みでエラーが発生しました:', error);
        createDefaultConfig();
        return;
      }
    } else {
      createDefaultConfig();
      return;
    }
  } else {
    // 開発環境では通常のデフォルト設定を作成
    createDefaultConfig();
    return;
  }
  
  // 初期設定ファイルを保存
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('初期設定ファイルを作成しました');
    console.log('設定内容:', JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('設定ファイルの保存でエラーが発生しました:', error);
  }
}

function createDefaultConfig() {
  // デフォルト設定を作成
  config = {
    dbPaths: {
      score: '',
      scorelog: '',
      scoredatalog: '',
      songdata: ''
    },
    difficultyTables: []
  };
  
  // ビルド環境の場合はconfig-build.jsonから設定を読み込み
  if (!isDevelopment) {
    const buildConfigPath = path.join(__dirname, 'config-build.json');
    if (fs.existsSync(buildConfigPath)) {
      try {
        const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath));
        config = buildConfig;
        console.log('config-build.jsonから設定を読み込みました');
      } catch (error) {
        console.error('config-build.jsonの読み込みでエラーが発生しました:', error);
      }
    }
  }
  
  // 設定ファイルを保存
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('設定ファイルを作成しました');
  } catch (error) {
    console.error('設定ファイルの作成でエラーが発生しました:', error);
  }
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function initializeLocalDatabase() {
  // アプリケーション専用のローカルデータベースを初期化
  // beatorajaのDBファイルとは独立して管理
  if (!fs.existsSync(localDbPath)) {
    const localDB = new sqlite3.Database(localDbPath);
    
    localDB.serialize(() => {
      // 楽曲の最高記録スナップショット
      localDB.run(`
        CREATE TABLE IF NOT EXISTS score_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sha256 TEXT NOT NULL,
          score INTEGER,
          minbp INTEGER,
          clear INTEGER,
          iidxScore INTEGER,
          date INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(sha256, date)
        )
      `);
      
      // 日別の更新記録
      localDB.run(`
        CREATE TABLE IF NOT EXISTS daily_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sha256 TEXT NOT NULL,
          play_date INTEGER NOT NULL,
          update_type TEXT NOT NULL,
          old_value INTEGER,
          new_value INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      
      // 最後にチェックした日付
      localDB.run(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id INTEGER PRIMARY KEY,
          last_sync_date INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      
      console.log('ローカルデータベースを初期化しました');
    });
    
    localDB.close();
  } else {
    // 既存のDBにiidxScoreカラムを追加（存在しない場合）
    const localDB = new sqlite3.Database(localDbPath);
    localDB.run(`ALTER TABLE score_history ADD COLUMN iidxScore INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('iidxScoreカラム追加エラー:', err);
      } else if (!err) {
        console.log('iidxScoreカラムを追加しました');
      }
    });
    localDB.close();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('renderer/index.html');
}

// 更新された楽曲を検出（scorelog.db ベース + 難易度表対応）
ipcMain.handle('get-updated-songs', async (_, dateString) => {
  const { score, scorelog, songdata, scoredatalog } = config.dbPaths;
  console.log('使用するDBパス:', {
    score: score,
    scorelog: scorelog,
    songdata: songdata,
    scoredatalog: scoredatalog
  });
  
  if (!fs.existsSync(score) || !fs.existsSync(scorelog) || !fs.existsSync(songdata)) {
    throw new Error('DBファイルが見つかりません。設定を確認してください。');
  }

  let scorelogDB, scoreDB, songdataDB, scoredatalogDB, localDB;

  try {
    // 難易度表データを読み込み
    const difficultyTables = await loadDifficultyTables(config);
    
    // 読み取り専用でDBを開く
    scorelogDB = new sqlite3.Database(scorelog, sqlite3.OPEN_READONLY);
    scoreDB = new sqlite3.Database(score, sqlite3.OPEN_READONLY);
    songdataDB = new sqlite3.Database(songdata, sqlite3.OPEN_READONLY);
    // 総ノーツ数計算用にscoredatalog.dbも開く
    if (fs.existsSync(scoredatalog)) {
      console.log(`scoredatalog.db接続成功: ${scoredatalog}`);
      scoredatalogDB = new sqlite3.Database(scoredatalog, sqlite3.OPEN_READONLY);
    } else {
      console.log(`scoredatalog.dbファイルが見つかりません: ${scoredatalog}`);
    }
    localDB = new sqlite3.Database(localDbPath); // ローカルDBのみ書き込み可能

    const targetDate = dayjs(dateString);
    const start = targetDate.startOf('day').unix();
    const end = targetDate.endOf('day').unix();

    console.log(`${dateString}の更新データを検索中...`);
    console.log(`[DEBUG] 検索対象日: ${targetDate.format('YYYY-MM-DD')}`);
    console.log(`[DEBUG] 検索範囲: ${start} - ${end} (${dayjs.unix(start).format('YYYY-MM-DD HH:mm:ss')} - ${dayjs.unix(end).format('YYYY-MM-DD HH:mm:ss')})`);

    // デバッグ用：指定日の記録数を確認
    const debugCount = await new Promise((resolve, reject) => {
      scorelogDB.get(
        `SELECT COUNT(*) as count FROM scorelog WHERE date >= ? AND date <= ?`,
        [start, end],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    console.log(`[DEBUG] 指定日の記録数: ${debugCount}件`);

    if (debugCount === 0) {
      console.log(`[WARNING] ${dateString}の記録が0件です。データベースの最新記録を確認します...`);
      const latestRecord = await new Promise((resolve, reject) => {
        scorelogDB.get(
          `SELECT date FROM scorelog ORDER BY date DESC LIMIT 1`,
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      if (latestRecord) {
        const latestDate = dayjs.unix(latestRecord.date);
        console.log(`[INFO] データベースの最新記録日: ${latestDate.format('YYYY-MM-DD HH:mm:ss')}`);
      }
    }
    
    // テーブル名を動的に取得（読み取り専用）
    const scorelogTables = await new Promise((resolve, reject) => {
      scorelogDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });
    
    const scoreTables = await new Promise((resolve, reject) => {
      scoreDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });
    
    const songdataTables = await new Promise((resolve, reject) => {
      songdataDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
        err ? reject(err) : resolve(rows));
    });

    // scoredatalogのテーブル名も取得
    let scoredatalogTableName = null;
    if (scoredatalogDB) {
      const scoredatalogTables = await new Promise((resolve, reject) => {
        scoredatalogDB.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, rows) => 
          err ? reject(err) : resolve(rows));
      });
      
      scoredatalogTableName = scoredatalogTables.find(t => 
        t.name.includes('scoredatalog') || t.name.includes('score') || t.name.includes('log')
      )?.name || scoredatalogTables[0]?.name;
    }

    const logTableName = scorelogTables.find(t => 
      t.name.includes('scorelog') || t.name.includes('log') || t.name.includes('play')
    )?.name || scorelogTables[0]?.name;
    
    const scoreTableName = scoreTables.find(t => 
      t.name.includes('score') || t.name.includes('song')
    )?.name || scoreTables[0]?.name;
    
    const songdataTableName = songdataTables.find(t => 
      t.name.includes('song') || t.name.includes('music') || t.name.includes('data')
    )?.name || songdataTables[0]?.name;

    if (isDevelopment) {
      console.log(`使用テーブル: scorelog=${logTableName}, score=${scoreTableName}, songdata=${songdataTableName}`);
    }

    // その日の更新ログを取得（scorelogから読み取り専用）
    const logs = await new Promise((resolve, reject) => {
      scorelogDB.all(
        `SELECT * FROM ${logTableName} WHERE date >= ? AND date <= ? ORDER BY date ASC`,
        [start, end],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    console.log(`${logs.length}件の更新ログが見つかりました`);
    
    // デバッグ：プレイログの内訳を確認
    if (isDevelopment) {
      const sha256Counts = new Map();
      logs.forEach(log => {
        const short = log.sha256.substring(0, 8);
        sha256Counts.set(short, (sha256Counts.get(short) || 0) + 1);
      });
      console.log(`重複を含むプレイログ詳細: 全${logs.length}件, ユニーク楽曲数: ${sha256Counts.size}`);
      
      // 複数回プレイされた楽曲を表示
      const multiplePlaySongs = Array.from(sha256Counts.entries()).filter(([_, count]) => count > 1);
      if (multiplePlaySongs.length > 0) {
        console.log('複数回プレイされた楽曲:');
        multiplePlaySongs.forEach(([sha256Short, count]) => {
          console.log(`  ${sha256Short}...: ${count}回`);
        });
      }
    }

    const result = [];
    const allPlayedSongs = []; // その日にプレイされた全楽曲（統計用・重複含む）
    const processedSongs = new Set();
    let debugShown = false;

    for (const row of logs) {
      // 楽曲情報を取得（統計用・全プレイログから取得）
      const songForStats = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT title, artist, md5, sha256, notes FROM ${songdataTableName} WHERE sha256 = ?`,
          [row.sha256],
          (err, data) => err ? reject(err) : resolve(data)
        );
      });

      // 楽曲情報が存在する場合は統計に追加（重複関係なく全プレイログを追加）
      if (songForStats) {
        allPlayedSongs.push({
          ...songForStats,
          playDate: row.date
        });
      } else {
        // 楽曲情報が見つからない場合でも統計にカウント（ノーツ数0として）
        allPlayedSongs.push({
          title: '[Unknown Song]',
          artist: '[Unknown]',
          md5: '',
          sha256: row.sha256,
          notes: 0,
          playDate: row.date
        });
        
        // 楽曲情報が見つからない場合をログ出力
        if (isDevelopment && allPlayedSongs.length < 30) {
          console.log(`楽曲情報なし: SHA256=${row.sha256.substring(0, 8)}...`);
        }
      }

      // 既に処理済みの楽曲はスキップ（表示用）
      if (processedSongs.has(row.sha256)) continue;
      processedSongs.add(row.sha256);

      // scoreDBから現在の最高記録を取得（読み取り専用）
      const currentBest = await new Promise((resolve, reject) => {
        scoreDB.get(
          `SELECT *, 
                  (epg + lpg) * 2 + (egr + lgr) * 1 as score,
                  minbp
           FROM ${scoreTableName} 
           WHERE sha256 = ? 
           ORDER BY score DESC, date DESC 
           LIMIT 1`,
          [row.sha256],
          (err, data) => {
            if (err) {
              reject(err);
            } else {
              // デバッグ用：最初の1回だけテーブル構造を表示
              if (isDevelopment && data && !debugShown) {
                console.log('スコアテーブルのカラム:', Object.keys(data));
                debugShown = true;
              }
              resolve(data);
            }
          }
        );
      });

      if (!currentBest) continue;

      // スコアの値を取得（複数のカラム名に対応）
      const currentScore = calculateScore(currentBest);
      const rawMinbp = currentBest.minbp || currentBest.minbad || currentBest.bad;
      const currentMinbp = (rawMinbp && rawMinbp < 999999) ? rawMinbp : 0; // 999999は初期値なので0として扱う
      const currentClear = currentBest.clear || currentBest.cleartype || 0;
      
      // IIDX仕様のSCORE・DJ LEVEL計算
      const iidxScore = calculateIIDXScore(currentBest);

      // 楽曲情報を取得（読み取り専用）- 表示用
      const song = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT title, artist, md5, sha256, notes FROM ${songdataTableName} WHERE sha256 = ?`,
          [row.sha256],
          (err, data) => err ? reject(err) : resolve(data)
        );
      }).catch(() => null);

      // scorelogベースでの差分計算
      const dailyUpdates = await calculateDailyBestUpdates(row.sha256, targetDate, scorelogDB, logTableName, song);
      
      // scorelogベースでの更新判定：差分が検出された場合のみ表示
      const hasUpdate = dailyUpdates.length > 0;

      if (hasUpdate) {
        // songが存在しない場合はスキップ
        if (!song) {
          continue;
        }

        // titleが存在しない楽曲はUnknown扱いでも統計に含める
        const isUnknownSong = !song.title || song.title.trim() === '';
        const displayTitle = isUnknownSong ? '[Unknown Song]' : song.title;

        // デバッグ用：最初の3楽曲のノーツ数をログ出力
        if (isDevelopment && result.length < 3) {
          console.log(`楽曲: ${song.title}, ノーツ数: ${song.notes}`);
        }

        // 難易度表から情報を検索（統合機能を使用）
        const tableInfos = findAllChartsInTables(difficultyTables, song?.md5, row.sha256);
        let tableSymbol = '';
        let tableLevel = '';
        let tableName = '';
        let levelOrderIndex = 999;
        let priority = 999;
        
        // デバッグ: 該当楽曲の難易度表情報をログ出力
        if (song?.title && song.title.includes('Stargazer')) {
          console.log(`[PRIORITY DEBUG] 楽曲: ${song.title}`);
          console.log(`[PRIORITY DEBUG] sha256: ${row.sha256}`);
          console.log(`[PRIORITY DEBUG] md5: ${song.md5}`);
          console.log(`[PRIORITY DEBUG] 全難易度表の検索結果:`);
          for (let i = 0; i < difficultyTables.length; i++) {
            const table = difficultyTables[i];
            console.log(`[PRIORITY DEBUG] テーブル ${i+1}: ${table.name} (priority: ${table.priority})`);
            const foundCharts = table.data.filter(chart => 
              (song.md5 && chart.md5 === song.md5) || (row.sha256 && chart.sha256 === row.sha256)
            );
            console.log(`[PRIORITY DEBUG]   → 該当チャート数: ${foundCharts.length}`);
            if (foundCharts.length > 0) {
              foundCharts.forEach(chart => {
                console.log(`[PRIORITY DEBUG]     - Level: ${chart.level}, Title: ${chart.title}`);
              });
            }
          }
          console.log(`[PRIORITY DEBUG] 発見された難易度表情報:`, tableInfos.map(info => ({
            tableName: info.table.name,
            priority: info.priority,
            level: info.level,
            symbol: info.symbol
          })));
        }
        
        if (tableInfos.length > 0) {
          // 優先度でソート
          tableInfos.sort((a, b) => a.priority - b.priority);
          const primaryTable = tableInfos[0];
          
          // デバッグ: ソート後の情報をログ出力
          if (song?.title && song.title.includes('Stargazer')) {
            console.log(`[PRIORITY DEBUG] ソート後のprimaryTable:`, {
              tableName: primaryTable.table.name,
              priority: primaryTable.priority,
              level: primaryTable.level,
              symbol: primaryTable.symbol
            });
          }
          
          // 複数表に登録されている場合、全てのシンボルを結合
          const symbols = tableInfos.map(info => {
            const symbol = info.symbol || '';
            const level = info.level || '';
            return symbol ? `${symbol}${level}` : level;
          }).filter(s => s);
          
          tableSymbol = symbols.join(' ');
          tableLevel = primaryTable.level;
          tableName = primaryTable.table.name;
          levelOrderIndex = getLevelOrderIndex(primaryTable.level, primaryTable.levelOrder);
          priority = primaryTable.priority;
        }

        // scoredatalogベースの更新情報のみを使用
        const allUpdates = dailyUpdates;
        
        if (isDevelopment) {
          console.log(`[DEBUG] ${song.title}: scoredatalog更新=${allUpdates.length}件`);
          if (allUpdates.length > 0) {
            console.log(`[DEBUG] scoredatalog更新詳細:`, allUpdates);
          }
        }

        // 次のDJ LEVELまでの差分を計算
        const nextDjLevelPoints = calculateNextDjLevelPoints(iidxScore.score, iidxScore.maxScore, iidxScore.djLevel);

        result.push({
          ...currentBest,
          ...song,
          title: displayTitle,  // 表示用タイトルを使用
          score: currentScore,
          minbp: currentMinbp,
          clear: currentClear,
          clearTypeName: getClearTypeName(currentClear),
          iidxScore: iidxScore.score,
          iidxMaxScore: iidxScore.maxScore,
          djLevel: iidxScore.djLevel,
          nextDjLevelPoints,
          totalNotes: song.notes || 0,  // songdata.dbから取得したnotesを使用
          updates: allUpdates,  // scoredatalogベースの更新情報
          playDate: row.date,
          isUnknownSong: isUnknownSong,  // Unknown Song判定フラグを追加
          // 難易度表情報（統合版）
          tableSymbol: tableSymbol,
          tableLevel: tableLevel,
          tableName: tableName,
          levelOrderIndex: levelOrderIndex,
          priority: priority
        });

        // デバッグ用：楽曲のノーツ数をログ出力
        if (isDevelopment) {
          console.log(`楽曲追加: ${displayTitle}, ノーツ数: ${song.notes}, Unknown: ${isUnknownSong}`);
        }

        // 更新記録も保存（アプリケーション側のデータのみ更新）
        for (const update of allUpdates) {
          await new Promise((resolve, reject) => {
            localDB.run(
              `INSERT INTO daily_updates 
               (sha256, play_date, update_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)`,
              [row.sha256, start, update.type, update.old, update.new],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }
    }

    // scoredatalogから当日プレイされた全楽曲の総ノーツ数を計算
    let totalNotesFromScoredatalog = 0;
    
    console.log(`デバッグ: scoredatalogDB=${!!scoredatalogDB}, scoredatalogTableName=${scoredatalogTableName}`);
    console.log(`デバッグ: 対象日付=${targetDate.format('YYYY-MM-DD')}`);
    
    if (scoredatalogDB && scoredatalogTableName) {
      try {
        const notesResult = await new Promise((resolve, reject) => {
          scoredatalogDB.get(
            `SELECT SUM(epg + lpg + egr + lgr + egd + lgd + ebd + lbd + epr + lpr + ems + lms) as total_notes
             FROM ${scoredatalogTableName} 
             WHERE DATE(date + 32400, 'unixepoch') = ?`,
            [targetDate.format('YYYY-MM-DD')],
            (err, data) => err ? reject(err) : resolve(data)
          );
        });
        
        console.log(`デバッグ: scoredatalogクエリ結果:`, notesResult);
        
        if (notesResult && notesResult.total_notes > 0) {
          totalNotesFromScoredatalog = notesResult.total_notes;
          console.log(`scoredatalogから計算した総ノーツ数: ${totalNotesFromScoredatalog} (全判定込み)`);
        } else {
          console.log(`デバッグ: scoredatalogから総ノーツ数が取得できませんでした (結果: ${notesResult?.total_notes})`);
        }
      } catch (error) {
        console.log('scoredatalogからの総ノーツ数計算エラー:', error.message);
      }
    } else {
      console.log(`デバッグ: scoredatalogDBまたはテーブル名が利用できません`);
    }

    // 統計情報を計算（その日に更新された楽曲を対象）
    const allSongsStats = {
      totalSongs: result.length, // 更新された楽曲数
      totalPlayedSongs: logs.length, // 更新ログ数
      totalNotes: totalNotesFromScoredatalog, // scoredatalogから計算した実際のプレイノーツ数
      displayedSongs: 0,
      hiddenSongs: 0,
      unknownSongs: result.filter(song => song.isUnknownSong).length
    };

    console.log(`統計情報計算: 更新楽曲数=${result.length}, 全更新ログ数=${allSongsStats.totalPlayedSongs}, Unknown楽曲数=${allSongsStats.unknownSongs}`);
    
    // 重複排除処理（統合表示）
    const songMap = new Map();
    const displayedSongs = [];
    
    for (const song of result) {
      // Unknown Songは統計には含めるが表示からは除外
      if (song.isUnknownSong) {
        allSongsStats.hiddenSongs++;
        console.log(`Unknown Song除外: ${song.title} (ノーツ数: ${song.totalNotes})`);
        continue;
      }
      
      if (!songMap.has(song.sha256)) {
        songMap.set(song.sha256, song);
        displayedSongs.push(song);
        allSongsStats.displayedSongs++;
      } else {
        // 既存の楽曲のシンボルに追加
        const existing = songMap.get(song.sha256);
        if (song.tableSymbol && !existing.tableSymbol.includes(song.tableSymbol)) {
          existing.tableSymbol = existing.tableSymbol ? 
            `${existing.tableSymbol} ${song.tableSymbol}` : song.tableSymbol;
        }
        allSongsStats.hiddenSongs++;
        console.log(`重複発見: ${song.title} (SHA256: ${song.sha256})`);
      }
    }
    
    console.log(`重複排除結果: 表示=${displayedSongs.length}件, 隠し=${allSongsStats.hiddenSongs}件`);

    // 難易度表の優先順位とレベル順でソート
    displayedSongs.sort((a, b) => {
      // 1. 難易度表に含まれる楽曲を優先
      const aHasTable = a.tableSymbol !== '';
      const bHasTable = b.tableSymbol !== '';
      
      if (aHasTable && !bHasTable) return -1;
      if (!aHasTable && bHasTable) return 1;
      
      // 2. 難易度表内では優先度順、同じ優先度ならレベル順
      if (aHasTable && bHasTable) {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.levelOrderIndex - b.levelOrderIndex;
      }
      
      // 3. 難易度表外では楽曲名順
      return (a.title || '').localeCompare(b.title || '');
    });

    console.log(`${result.length}件の更新が見つかりました（表示: ${allSongsStats.displayedSongs}件、統合: ${allSongsStats.hiddenSongs}件）`);
    
    return {
      songs: displayedSongs,
      stats: allSongsStats
    };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    // 全てのDBコネクションを安全に閉じる
    try {
      if (scorelogDB) {
        await new Promise((resolve) => {
          scorelogDB.close((err) => {
            if (err) console.error('scorelogDB close error:', err);
            resolve();
          });
        });
      }
      if (scoreDB) {
        await new Promise((resolve) => {
          scoreDB.close((err) => {
            if (err) console.error('scoreDB close error:', err);
            resolve();
          });
        });
      }
      if (songdataDB) {
        await new Promise((resolve) => {
          songdataDB.close((err) => {
            if (err) console.error('songdataDB close error:', err);
            resolve();
          });
        });
      }
      if (scoredatalogDB) {
        await new Promise((resolve) => {
          scoredatalogDB.close((err) => {
            if (err) console.error('scoredatalogDB close error:', err);
            resolve();
          });
        });
      }
      if (localDB) {
        await new Promise((resolve) => {
          localDB.close((err) => {
            if (err) console.error('localDB close error:', err);
            resolve();
          });
        });
      }
    } catch (closeError) {
      console.error('Error closing databases:', closeError);
    }
  }
});

// その他のIPCハンドラー
ipcMain.handle('get-config', () => config);

ipcMain.handle('update-config', (_, newConfig) => {
  Object.assign(config, newConfig);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
});

ipcMain.handle('set-config', (_, newPaths) => {
  config.dbPaths = newPaths;
  saveConfig();
});

ipcMain.handle('select-db-path', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// フォルダ選択
ipcMain.handle('select-folder-path', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// パス結合
ipcMain.handle('join-path', (_, ...paths) => {
  return path.join(...paths);
});

// ファイル存在確認
ipcMain.handle('file-exists', (_, filePath) => {
  return fs.existsSync(filePath);
});

// 確認ダイアログ（Electronの既知の不具合回避のため）
ipcMain.handle('show-confirm-dialog', async (_, message, title = '確認') => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['キャンセル', 'OK'],
    defaultId: 1,
    title: title,
    message: message
  });
  return result.response === 1; // OKボタンが押された場合はtrue
});

ipcMain.handle('get-clear-type-name', (_, clearType) => {
  return getClearTypeName(clearType);
});

ipcMain.handle('check-db-structure', async () => {
  const { score, scorelog, songdata } = config.dbPaths;
  if (!fs.existsSync(score) || !fs.existsSync(scorelog) || !fs.existsSync(songdata)) {
    throw new Error('DBファイルが見つかりません。設定を確認してください。');
  }

  const results = {};

  // beatorajaのDBファイルは全て読み取り専用で開く
  const scorelogDB = new sqlite3.Database(scorelog, sqlite3.OPEN_READONLY);
  const scorelogTables = await new Promise((resolve, reject) => {
    scorelogDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.scorelog = scorelogTables;

  const scoreDB = new sqlite3.Database(score, sqlite3.OPEN_READONLY);
  const scoreTables = await new Promise((resolve, reject) => {
    scoreDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.score = scoreTables;

  const songdataDB = new sqlite3.Database(songdata, sqlite3.OPEN_READONLY);
  const songdataTables = await new Promise((resolve, reject) => {
    songdataDB.all(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  results.songdata = songdataTables;

  scorelogDB.close();
  scoreDB.close();
  songdataDB.close();

  return results;
});

ipcMain.handle('get-song-score', async (_, hash) => {
  try {
    console.log(`Getting score for hash: ${hash}`);
    
    // 設定されたDBパスを使用（開発環境でも設定優先）
    let { score: scorePath, songdata: songdataPath } = config.dbPaths;
    console.log(`Config DB paths - score: ${scorePath}, songdata: ${songdataPath}`);
    
    // 開発環境で設定が空の場合のみサンプルDBを使用
    if (isDevelopment && (!scorePath || !songdataPath)) {
      console.log('Development mode: using sample DB as fallback');
      scorePath = scorePath || path.join(sampleDbPath, 'score.db');
      songdataPath = songdataPath || path.join(sampleDbPath, 'songdata.db');
      console.log(`Fallback DB paths - score: ${scorePath}, songdata: ${songdataPath}`);
    }
    
    console.log(`Using DB paths - score: ${scorePath}, songdata: ${songdataPath}`);
    
    if (!scorePath || !songdataPath) {
      console.log('Database paths not configured');
      return null;
    }
    
    console.log(`Checking file existence - score: ${fs.existsSync(scorePath)}, songdata: ${fs.existsSync(songdataPath)}`);
    if (!fs.existsSync(scorePath) || !fs.existsSync(songdataPath)) {
      console.log('Database files not found at specified paths');
      return null;
    }

    const scoreDB = new sqlite3.Database(scorePath, sqlite3.OPEN_READONLY);
    const songdataDB = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);

    let scoreData = null;
    let songData = null;

    // SHA256の場合（64文字）
    if (hash.length === 64) {
      console.log('SHA256 hash detected, querying directly');
      
      // スコア情報を取得
      scoreData = await new Promise((resolve, reject) => {
        scoreDB.get(
          `SELECT * FROM score WHERE sha256 = ?`,
          [hash],
          (err, row) => {
            if (err) {
              console.error('Score query error:', err);
              reject(err);
            } else {
              console.log(`Score data found:`, row);
              resolve(row);
            }
          }
        );
      });

      // 楽曲情報を取得
      songData = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT * FROM song WHERE sha256 = ?`,
          [hash],
          (err, row) => {
            if (err) {
              console.error('Song data query error:', err);
              reject(err);
            } else {
              console.log(`Song data found:`, row);
              resolve(row);
            }
          }
        );
      });
    } 
    // MD5の場合（32文字）
    else if (hash.length === 32) {
      console.log('MD5 hash detected, converting to SHA256');
      
      // MD5からSHA256を取得
      songData = await new Promise((resolve, reject) => {
        songdataDB.get(
          `SELECT * FROM song WHERE md5 = ?`,
          [hash],
          (err, row) => {
            if (err) {
              console.error('Song data query error:', err);
              reject(err);
            } else {
              console.log(`Song data found by MD5:`, row);
              resolve(row);
            }
          }
        );
      });

      if (songData && songData.sha256) {
        console.log(`Converted MD5 ${hash} to SHA256: ${songData.sha256}`);
        
        // SHA256でスコア情報を取得
        scoreData = await new Promise((resolve, reject) => {
          scoreDB.get(
            `SELECT * FROM score WHERE sha256 = ?`,
            [songData.sha256],
            (err, row) => {
              if (err) {
                console.error('Score query error:', err);
                reject(err);
              } else {
                console.log(`Score data found by converted SHA256:`, row);
                resolve(row);
              }
            }
          );
        });
      }
    } else {
      console.log(`Invalid hash length: ${hash.length}, expected 32 (MD5) or 64 (SHA256)`);
      scoreDB.close();
      songdataDB.close();
      return null;
    }

    scoreDB.close();
    songdataDB.close();

    if (!scoreData) {
      console.log(`No score data found for hash: ${hash}`);
      return null;
    }

    // EXスコアとパーセンテージを計算
    const notes = songData ? songData.notes : null;
    const maxScore = notes ? notes * 2 : null;
    const exScore = scoreData.epg * 2 + scoreData.egr + scoreData.lpg * 2 + scoreData.lgr;
    const percentage = maxScore ? (exScore / maxScore) * 100 : 0;

    // DJレベルポイントを計算
    const points = calculateDjLevelPoints(scoreData, songData);

    // DJ LEVELを計算
    const djLevel = calculateDjLevel(percentage);

    // beatorajaスコア（パーセンテージ）
    const beatorajaScore = percentage;

    return {
      sha256: scoreData.sha256,
      score: exScore,
      clear: scoreData.clear,
      rank: calculateRank(percentage),
      percentage: percentage,
      points: points,
      playcount: scoreData.playcount || 0,
      notes: notes,
      minbp: (scoreData.minbp && scoreData.minbp < 999999) ? scoreData.minbp : 0, // ミスカウント（999999は初期値なので0として扱う）
      djLevel: djLevel, // DJ LEVEL
      beatorajaScore: beatorajaScore, // beatorajaスコアレート
      lastPlayed: scoreData.date || null // 最終プレイ日時
    };
  } catch (error) {
    console.error('楽曲スコア取得エラー:', error);
    return null;
  }
});

ipcMain.handle('load-difficulty-table', async (_, tableUrl) => {
  try {
    console.log(`Loading difficulty table from: ${tableUrl}`);
    
    let jsonUrl;
    
    // URLが直接JSONファイルを指しているかチェック
    if (tableUrl.endsWith('.json')) {
      console.log('Direct JSON URL detected');
      jsonUrl = tableUrl;
    } else if (tableUrl.endsWith('/')) {
      // ディレクトリURLの場合、header.jsonを自動補完
      console.log('Directory URL detected, trying header.json');
      jsonUrl = tableUrl + 'header.json';
    } else {
      // HTMLページを取得
      try {
        const html = await fetchHtml(tableUrl);
        console.log(`HTML response length: ${html.length} characters`);
        console.log(`HTML start: ${html.substring(0, 200)}...`);
        
        // URLからJSONのURLを抽出
        jsonUrl = extractJsonUrlFromHtml(html, tableUrl);
        console.log(`Extracted JSON URL from HTML: ${jsonUrl}`);
      } catch (htmlError) {
        console.log(`Failed to fetch HTML, assuming directory URL: ${htmlError.message}`);
        // HTMLの取得に失敗した場合、ディレクトリURLとしてheader.jsonを試行
        jsonUrl = constructJsonUrl('header.json', tableUrl);
      }
    }
    
    // ヘッダー情報を取得（複数パターンを試行）
    let header;
    const headerPatterns = [
      jsonUrl,
      constructJsonUrl('header.json', tableUrl),
      constructJsonUrl('table.json', tableUrl),
      constructJsonUrl('index.json', tableUrl),
      constructJsonUrl('data/header.json', tableUrl),
      constructJsonUrl('json/header.json', tableUrl)
    ];
    
    for (const headerUrl of headerPatterns) {
      try {
        console.log(`Trying header URL: ${headerUrl}`);
        header = await fetchJson(headerUrl);
        console.log('Header loaded successfully. Name:', header.name || 'Unknown', 'Symbol:', header.symbol || 'N/A', 'Data URL:', header.data_url);
        jsonUrl = headerUrl; // 成功したURLを記録
        break;
      } catch (headerError) {
        console.log(`Failed to load header from ${headerUrl}: ${headerError.message}`);
        if (headerUrl === headerPatterns[headerPatterns.length - 1]) {
          // 最後のパターンでも失敗した場合
          throw new Error(`Could not find valid header file. Tried: ${headerPatterns.join(', ')}`);
        }
        continue;
      }
    }
    
    if (!header) {
      throw new Error('Failed to load header from any pattern');
    }
    
    // データファイルのURLを構築
    let dataUrl;
    if (header.data_url.startsWith('http://') || header.data_url.startsWith('https://')) {
      // data_urlが既に完全なURLの場合はそのまま使用
      dataUrl = header.data_url;
    } else {
      // 相対URLの場合はベースURLと結合
      dataUrl = new URL(header.data_url, jsonUrl).href;
    }
    console.log(`Data URL: ${dataUrl}`);
    
    // データを取得（Google Scriptsの場合は複数パターンを試行）
    let data;
    if (dataUrl.includes('script.google') || dataUrl.includes('script.googleusercontent.com')) {
      console.log('Google Scripts URL detected, trying multiple patterns...');
      
        // Google ScriptsのURLパターンを複数試行
        const googlePatternsToTry = [
          dataUrl, // 元のURL
          dataUrl.replace('script.googleusercontent.com', 'script.google.com'), // スクリプトURLに変更
          dataUrl.replace('script.google.com', 'script.googleusercontent.com'), // ユーザーコンテンツURLに変更
          // exec形式への変換を試行
          dataUrl.replace(/macros\/echo\?.*/, 'macros/s/' + extractScriptId(dataUrl) + '/exec')
        ];      for (const googleUrl of googlePatternsToTry) {
        try {
          console.log(`Trying Google Scripts URL: ${googleUrl}`);
          data = await fetchJson(googleUrl);
          console.log(`Successfully fetched data from: ${googleUrl}`);
          break;
        } catch (googleError) {
          console.log(`Failed to fetch from ${googleUrl}: ${googleError.message}`);
          if (googleUrl === googlePatternsToTry[googlePatternsToTry.length - 1]) {
            throw new Error(`Failed to fetch Google Scripts data from all patterns: ${googlePatternsToTry.join(', ')}`);
          }
          continue;
        }
      }
    } else {
      // 通常のURL
      data = await fetchJson(dataUrl);
    }
    console.log(`Data loaded - structure:`, {
      isArray: Array.isArray(data),
      length: data.length,
      firstItem: data[0],
      // データ形式を検出
      dataFormat: data.length > 0 ? (
        data[0].songs ? 'level-grouped' : 'flat-array'
      ) : 'empty',
      // フラット配列の場合はレベル別集計
      levelStats: data.length > 0 && !data[0].songs ? (() => {
        const levelCounts = {};
        data.forEach(item => {
          const level = item.level || 'unknown';
          levelCounts[level] = (levelCounts[level] || 0) + 1;
        });
        return Object.entries(levelCounts).map(([level, count]) => ({
          level: level,
          songsCount: count
        })).sort((a, b) => {
          const numA = parseFloat(a.level) || 999;
          const numB = parseFloat(b.level) || 999;
          return numA - numB;
        });
      })() : 'level-grouped format'
    });
    
    return {
      header: header,
      body: data
    };
  } catch (error) {
    console.error('難易度表データ読み込みエラー:', error);
    throw error;
  }
});

// アプリケーションの準備
app.whenReady().then(() => {
  loadConfig();
  initializeLocalDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
