const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const https = require('https');
const http = require('http');
const fetch = require('node-fetch');
const FormData = require('form-data');

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

// 更新曲一覧で使用する難易度表のみを取得
async function loadSelectedDifficultyTables(config) {
  console.log('loadSelectedDifficultyTables called with config:', !!config);
  
  // 旧設定形式との互換性を保つ
  const selectedUrls = config.defaultTableUrls || (config.defaultTableUrl ? [config.defaultTableUrl] : []);
  
  console.log('Selected table URLs for update list:', selectedUrls);
  
  if (!selectedUrls || selectedUrls.length === 0) {
    console.log('No difficulty tables selected for update list, returning empty array');
    return [];
  }
  
  // 選択されたテーブルの設定のみを取得
  const selectedTableConfigs = (config.difficultyTables || []).filter(tableConfig => 
    selectedUrls.includes(tableConfig.url)
  );
  
  console.log('Selected table configs:', selectedTableConfigs.map(t => ({name: t.name, url: t.url})));
  
  if (selectedTableConfigs.length === 0) {
    console.log('No matching table configurations found for selected URLs');
    return [];
  }
  
  // キャッシュの確認
  const now = Date.now();
  let useCache = false;
  
  if (difficultyTablesCache && (now - difficultyTablesLastUpdated) < CACHE_DURATION) {
    // キャッシュが有効な場合、選択されたテーブルのみを抽出
    const cachedSelectedTables = difficultyTablesCache.filter(table => 
      selectedUrls.includes(table.url)
    );
    
    // 必要なテーブルがすべてキャッシュに存在するかチェック
    const allSelectedInCache = selectedTableConfigs.every(config => 
      cachedSelectedTables.some(cached => cached.url === config.url)
    );
    
    if (allSelectedInCache) {
      console.log(`Using cached data for ${cachedSelectedTables.length} selected tables`);
      return cachedSelectedTables.sort((a, b) => a.priority - b.priority);
    }
  }
  
  console.log(`Loading ${selectedTableConfigs.length} selected difficulty tables...`);
  const tables = [];
  
  for (const tableConfig of selectedTableConfigs) {
    try {
      console.log(`Loading selected table: ${tableConfig.name} from ${tableConfig.url}`);
      
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
              console.log(`Trying header pattern: ${headerPattern}`);
              header = await fetchJson(headerPattern);
              console.log(`Header loaded successfully from: ${headerPattern}`);
              break;
            } catch (headerError) {
              console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
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
            console.log(`Trying header pattern: ${headerPattern}`);
            header = await fetchJson(headerPattern);
            console.log(`Header loaded successfully from: ${headerPattern}`);
            break;
          } catch (headerError) {
            console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
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

// 更新曲一覧で使用する難易度表のみを取得
async function loadSelectedDifficultyTables(config) {
  console.log('loadSelectedDifficultyTables called with config:', !!config);
  
  // 旧設定形式との互換性を保つ
  const selectedUrls = config.defaultTableUrls || (config.defaultTableUrl ? [config.defaultTableUrl] : []);
  
  console.log('Selected table URLs for update list:', selectedUrls);
  
  if (!selectedUrls || selectedUrls.length === 0) {
    console.log('No difficulty tables selected for update list, returning empty array');
    return [];
  }
  
  // 選択されたテーブルの設定のみを取得
  const selectedTableConfigs = (config.difficultyTables || []).filter(tableConfig => 
    selectedUrls.includes(tableConfig.url)
  );
  
  console.log('Selected table configs:', selectedTableConfigs.map(t => ({name: t.name, url: t.url})));
  
  if (selectedTableConfigs.length === 0) {
    console.log('No matching table configurations found for selected URLs');
    return [];
  }
  
  // キャッシュの確認
  const now = Date.now();
  let useCache = false;
  
  if (difficultyTablesCache && (now - difficultyTablesLastUpdated) < CACHE_DURATION) {
    // キャッシュが有効な場合、選択されたテーブルのみを抽出
    const cachedSelectedTables = difficultyTablesCache.filter(table => 
      selectedUrls.includes(table.url)
    );
    
    // 必要なテーブルがすべてキャッシュに存在するかチェック
    const allSelectedInCache = selectedTableConfigs.every(config => 
      cachedSelectedTables.some(cached => cached.url === config.url)
    );
    
    if (allSelectedInCache) {
      console.log(`Using cached data for ${cachedSelectedTables.length} selected tables`);
      return cachedSelectedTables.sort((a, b) => a.priority - b.priority);
    }
  }
  
  console.log(`Loading ${selectedTableConfigs.length} selected difficulty tables...`);
  const tables = [];
  
  for (const tableConfig of selectedTableConfigs) {
    try {
      let header;
      let data; 
      let usedLocalFiles = false;
      
      // 🔍 ローカル保存ファイルをチェック
      const savedFiles = tableConfig.savedFiles;
      if (savedFiles && savedFiles.headerPath && savedFiles.dataPath) {
        console.log(`📁 Checking local files for ${tableConfig.name}:`);
        console.log(`  Header: ${savedFiles.headerPath}`);
        console.log(`  Data: ${savedFiles.dataPath}`);
        
        try {
          if (fs.existsSync(savedFiles.headerPath) && fs.existsSync(savedFiles.dataPath)) {
            console.log(`✅ Loading ${tableConfig.name} from local files`);
            header = JSON.parse(fs.readFileSync(savedFiles.headerPath, 'utf8'));
            data = JSON.parse(fs.readFileSync(savedFiles.dataPath, 'utf8'));
            usedLocalFiles = true;
            console.log(`🎯 Local data loaded: ${data.length} charts`);
          } else {
            console.log(`⚠️ Local files not found for ${tableConfig.name}, falling back to network`);
          }
        } catch (localError) {
          console.log(`❌ Error reading local files for ${tableConfig.name}: ${localError.message}`);
          console.log(`🌐 Falling back to network loading`);
        }
      }
      
      if (!usedLocalFiles) {
        console.log(`Loading selected table: ${tableConfig.name} from ${tableConfig.url}`);
        
        let headerUrl = tableConfig.url;
        
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
                console.log(`Trying header pattern: ${headerPattern}`);
                header = await fetchJson(headerPattern);
                console.log(`Header loaded successfully from: ${headerPattern}`);
                break;
              } catch (headerError) {
                console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
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
              console.log(`Trying header pattern: ${headerPattern}`);
              header = await fetchJson(headerPattern);
              console.log(`Header loaded successfully from: ${headerPattern}`);
              break;
            } catch (headerError) {
              console.log(`Failed to load header from ${headerPattern}: ${headerError.message}`);
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
      } // end of !usedLocalFiles check
      
      // ローカルファイル使用時の追加ログ - TARGET_FUNCTION_MARKER - UNIQUE_ID_123
      if (!usedLocalFiles) {
        console.log(`📊 Network data loaded: ${data ? data.length : 0} charts`);
      }
      
      tables.push({
        ...tableConfig,
        header,
        data,
        symbol: header.symbol || '',
        levelOrder: header.level_order || []
      });
      
    } catch (error) {
      console.warn(`Failed to load selected difficulty table ${tableConfig.name}:`, error.message);
    }
  }
  
  // 優先順位でソート
  tables.sort((a, b) => a.priority - b.priority);
  
  console.log(`Selected difficulty tables loaded: ${tables.length} out of ${selectedTableConfigs.length} requested`);
  
  return tables;
}

// 譜面のmd5/sha256から難易度表情報を検索（最高優先度のみ）
// function findChartInTables(tables, md5, sha256) {
//   for (const table of tables) {
//     for (const chart of table.data) {
//       if ((md5 && chart.md5 === md5) || (sha256 && chart.sha256 === sha256)) {
//         return {
//           table,
//           chart,
//           symbol: table.symbol,
//           level: chart.level,
//           levelOrder: table.levelOrder
//         };
//       }
//     }
//   }
//   return null;
// }

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
        // ただし、前回ミスカウントが-999999の場合や初回プレイ時（NO PLAYから）は差分表示しない
        if (update.minbp < 999999 && update.oldminbp !== -999999 && update.oldscore > 0) {
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
          // ただし、前回ミスカウントが-999999の場合や初回プレイ時（NO PLAYから）は差分表示しない
          let missImprovement = 0;
          if (update.oldminbp !== -999999 && update.oldscore > 0) {
            missImprovement = 999999 - update.minbp;
            if (song && song.notes && typeof song.notes === 'number' && song.notes > 0) {
              missImprovement = song.notes - update.minbp;
            }
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
        // ただし、前回ミスカウントが-999999の場合は差分表示しない
        if (missDiff > 0 && update.oldminbp < 2147483647 && update.minbp < 999999 && update.oldminbp !== -999999) {
          updates.push({
            type: 'daily_miss',
            diff: -missDiff, // 負の値で保存（表示時に-52として表示）
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
  },
  lastScreenshotPath: null,
  lastScreenshotDirectory: null
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
    width: 1060,
    height: 1000,
    autoHideMenuBar: true, // メニューバーを自動的に隠す
    icon: path.join(__dirname, 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  });

  win.loadFile('src/windows/main/index.html');
}

function createSmartViewWindow() {
  const smartViewWin = new BrowserWindow({
    width: 600,
    height: 900,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    title: 'Smart View - Beat Archive'
  });

  smartViewWin.loadFile('src/windows/smartview/smartview.html');
}

// 楽曲のタイトルとサブタイトルを結合して表示用タイトルを生成
function formatSongTitle(song) {
  if (!song || !song.title || song.title.trim() === '') {
    return '[Unknown Song]';
  }
  
  const title = song.title.trim();
  const subtitle = song.subtitle && song.subtitle.trim() ? song.subtitle.trim() : null;
  
  if (subtitle) {
    return `${title} ${subtitle}`;
  }
  
  return title;
}

// 更新された楽曲を検出（scorelog.db ベース + 難易度表対応）
ipcMain.handle('get-updated-songs', async (_, dateString) => {
  console.log('get-updated-songs called with dateString:', dateString);
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
    // 更新曲一覧で使用する選択された難易度表のみを読み込み
    const difficultyTables = await loadSelectedDifficultyTables(config);
    
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
          `SELECT title, subtitle, artist, md5, sha256, notes, level FROM ${songdataTableName} WHERE sha256 = ?`,
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
        // 楽曲情報が見つつからない場合でも統計にカウント（ノーツ数0として）
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
          `SELECT title, subtitle, artist, md5, sha256, notes, level FROM ${songdataTableName} WHERE sha256 = ?`,
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
          title: song.title,  // 生のタイトルを使用（renderer.jsで結合）
          subtitle: song.subtitle,  // サブタイトルも明示的に含める
          songLevel: song.level,  // songdata.dbのlevelをsongLevelとして追加
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
          console.log(`楽曲追加: ${song.title}, ノーツ数: ${song.notes}, Unknown: ${isUnknownSong}`);
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
  console.log('update-configが呼ばれました');
  console.log('受信したnewConfig:', JSON.stringify(newConfig, null, 2));
  console.log('現在のconfig:', JSON.stringify(config, null, 2));
  
  Object.assign(config, newConfig);
  console.log('マージ後のconfig:', JSON.stringify(config, null, 2));
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('config.jsonに書き込み完了:', configPath);
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

// config_sys.jsonファイル選択と読み込み
ipcMain.handle('select-and-read-config-sys', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    title: 'config_sys.jsonファイルを選択してください'
  });
  
  if (result.canceled) {
    return null;
  }
  
  const filePath = result.filePaths[0];
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const configSys = JSON.parse(content);
    
    // tableURLが存在するかチェック
    if (!configSys.tableURL || !Array.isArray(configSys.tableURL)) {
      throw new Error('config_sys.jsonにtableURL配列が見つかりません');
    }
    
    return {
      tableURLs: configSys.tableURL,
      filePath: filePath
    };
  } catch (error) {
    console.error('config_sys.json読み込みエラー:', error);
    throw error;
  }
});

// 難易度表のheaderとdataをローカル保存
ipcMain.handle('save-difficulty-table-data', async (_, tableUrl, headerData, bodyData) => {
  try {
    // 保存先ディレクトリの作成
    const tablesDir = path.join(app.getPath('userData'), 'difficulty-tables');
    if (!fs.existsSync(tablesDir)) {
      fs.mkdirSync(tablesDir, { recursive: true });
    }
    
    // URLからファイル名を生成（安全な文字のみ使用）
    const urlHash = require('crypto').createHash('md5').update(tableUrl).digest('hex');
    const headerPath = path.join(tablesDir, `${urlHash}_header.json`);
    const dataPath = path.join(tablesDir, `${urlHash}_data.json`);
    
    // ファイルに保存
    fs.writeFileSync(headerPath, JSON.stringify(headerData, null, 2));
    fs.writeFileSync(dataPath, JSON.stringify(bodyData, null, 2));
    
    console.log(`難易度表データを保存しました: ${tableUrl}`);
    console.log(`Header: ${headerPath}`);
    console.log(`Data: ${dataPath}`);
    
    return {
      success: true,
      headerPath: headerPath,
      dataPath: dataPath,
      urlHash: urlHash
    };
  } catch (error) {
    console.error('難易度表データ保存エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ローカル保存された難易度表データの読み込み
ipcMain.handle('load-saved-difficulty-table', async (_, tableUrl) => {
  try {
    const tablesDir = path.join(app.getPath('userData'), 'difficulty-tables');
    const urlHash = require('crypto').createHash('md5').update(tableUrl).digest('hex');
    const headerPath = path.join(tablesDir, `${urlHash}_header.json`);
    const dataPath = path.join(tablesDir, `${urlHash}_data.json`);
    
    if (!fs.existsSync(headerPath) || !fs.existsSync(dataPath)) {
      throw new Error('保存されたデータが見つかりません');
    }
    
    const headerData = JSON.parse(fs.readFileSync(headerPath, 'utf8'));
    const bodyData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    return {
      success: true,
      header: headerData,
      body: bodyData
    };
  } catch (error) {
    console.error('保存された難易度表データ読み込みエラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 保存された難易度表データが存在するかチェック
ipcMain.handle('check-saved-difficulty-table', async (_, tableUrl) => {
  try {
    const tablesDir = path.join(app.getPath('userData'), 'difficulty-tables');
    const urlHash = require('crypto').createHash('md5').update(tableUrl).digest('hex');
    const headerPath = path.join(tablesDir, `${urlHash}_header.json`);
    const dataPath = path.join(tablesDir, `${urlHash}_data.json`);
    
    const exists = fs.existsSync(headerPath) && fs.existsSync(dataPath);
    
    return {
      exists: exists,
      headerPath: exists ? headerPath : null,
      dataPath: exists ? dataPath : null,
      urlHash: urlHash
    };
  } catch (error) {
    console.error('保存済み難易度表データチェックエラー:', error);
    return {
      exists: false,
      error: error.message
    };
  }
});

// 保存済み難易度表データの削除
ipcMain.handle('delete-saved-difficulty-table', async (_, tableUrl) => {
  try {
    const tablesDir = path.join(app.getPath('userData'), 'difficulty-tables');
    const urlHash = require('crypto').createHash('md5').update(tableUrl).digest('hex');
    const headerPath = path.join(tablesDir, `${urlHash}_header.json`);
    const dataPath = path.join(tablesDir, `${urlHash}_data.json`);
    
    let deletedFiles = [];
    let errors = [];
    
    // ヘッダーファイルを削除
    if (fs.existsSync(headerPath)) {
      try {
        fs.unlinkSync(headerPath);
        deletedFiles.push(headerPath);
        console.log(`削除完了: ${headerPath}`);
      } catch (error) {
        errors.push(`ヘッダーファイル削除エラー: ${error.message}`);
      }
    }
    
    // データファイルを削除
    if (fs.existsSync(dataPath)) {
      try {
        fs.unlinkSync(dataPath);
        deletedFiles.push(dataPath);
        console.log(`削除完了: ${dataPath}`);
      } catch (error) {
        errors.push(`データファイル削除エラー: ${error.message}`);
      }
    }
    
    return {
      success: errors.length === 0,
      deletedFiles: deletedFiles,
      errors: errors,
      urlHash: urlHash
    };
  } catch (error) {
    console.error('保存済み難易度表データ削除エラー:', error);
    return {
      success: false,
      errors: [error.message]
    };
  }
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

    // 楽曲データがない場合はNO SONGを表現
    if (!songData) {
      console.log(`No song data found for hash: ${hash}`);
      return {
        sha256: hash.length === 64 ? hash : null,
        score: 0,
        clear: -1, // -1でNO SONGを表現
        rank: '',
        percentage: 0,
        points: 0,
        playcount: 0,
        notes: null,
        minbp: null,
        djLevel: 'F',
        beatorajaScore: 0,
        lastPlayed: null
      };
    }

    // 楽曲データはあるがスコアデータがない場合はNO PLAYを表現
    if (!scoreData) {
      console.log(`No score data found for hash: ${hash}, but song data exists`);
      return {
        sha256: songData.sha256,
        score: 0,
        clear: 0, // 0でNO PLAYを表現
        rank: '',
        percentage: 0,
        points: 0,
        playcount: 0,
        notes: songData.notes,
        minbp: null,
        djLevel: 'F',
        beatorajaScore: 0,
        lastPlayed: null
      };
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
    
    // 📁 ローカルファイル対応: configから該当する難易度表の設定を検索
    let localHeader = null;
    let localData = null;
    
    try {
      // configが未読み込みの場合は読み込む
      if (!config) {
        loadConfig();
      }
      
      const tableConfig = config.difficultyTables?.find(table => table.url === tableUrl);
      
      if (tableConfig && tableConfig.savedFiles && 
          tableConfig.savedFiles.headerPath && tableConfig.savedFiles.dataPath) {
        console.log(`📁 Checking local files for ${tableConfig.name}:`);
        console.log(`  Header: ${tableConfig.savedFiles.headerPath}`);
        console.log(`  Data: ${tableConfig.savedFiles.dataPath}`);
        
        try {
          if (fs.existsSync(tableConfig.savedFiles.headerPath) && fs.existsSync(tableConfig.savedFiles.dataPath)) {
            console.log('✅ Loading from local files');
            localHeader = JSON.parse(fs.readFileSync(tableConfig.savedFiles.headerPath, 'utf8'));
            localData = JSON.parse(fs.readFileSync(tableConfig.savedFiles.dataPath, 'utf8'));
            console.log(`🎯 Local data loaded: ${localData.length} charts from ${tableConfig.name}`);
            
            return {
              header: localHeader,
              body: localData
            };
          } else {
            console.log('❌ Local files not found, falling back to network');
          }
        } catch (localError) {
          console.error('❌ Error reading local files:', localError);
          console.log('🌐 Falling back to network loading');
        }
      } else {
        console.log('🌐 No local files configured, using network');
      }
    } catch (configError) {
      console.error('⚠️ Error loading config for local file check:', configError);
      console.log('🌐 Proceeding with network loading');
    }
    
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

// ディレクトリ選択ダイアログ
ipcMain.handle('select-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'スクリーンショット保存先を選択'
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// スクロール＋画像合成スクリーンショット撮影
ipcMain.handle('take-scrolling-screenshot', async (_, directory, datePrefix, maxSegmentHeight) => {
  const { nativeImage, BrowserWindow } = require('electron');
  const path = require('path');
  const fs = require('fs').promises;
  const sharp = require('sharp');

  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('ウィンドウが見つかりません');
    }

    console.log('スクロール撮影・画像合成処理を開始...');

    const pageInfo = await mainWindow.webContents.executeJavaScript(`(() => {
      const section2 = document.querySelector('div.section2'); // class="section2"の要素を取得
      
      if (!section2) {
        throw new Error('class="section2"の要素が見つかりません');
      }
      
      const rect = section2.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      return {
        totalHeight: Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio,
        sectionTop: rect.top + scrollTop,
        sectionHeight: rect.height,
        sectionWidth: rect.width,
        sectionLeft: rect.left
      };
    })()`);;

    console.log('ページ情報:', pageInfo);
    
    // section2が見つからない場合の処理
    if (!pageInfo.sectionTop || pageInfo.sectionHeight <= 0) {
      console.log('class="section2"の要素が見つからないか、無効なサイズです。');
      return { success: false, error: 'class="section2"の要素が見つかりません' };
    }

    // section2の撮影範囲を定義
    const scrollStart = pageInfo.sectionTop;
    const captureHeight = pageInfo.sectionHeight;
    const captureWidth = pageInfo.sectionWidth;
    const captureLeft = pageInfo.sectionLeft;
    
    console.log(`撮影範囲詳細: scrollStart=${scrollStart}, captureHeight=${captureHeight}, captureWidth=${captureWidth}, captureLeft=${captureLeft}`);

    const segmentHeight = Math.min(maxSegmentHeight, pageInfo.viewportHeight);
    const segments = Math.ceil(captureHeight / segmentHeight);
    
    // 動的セグメント情報の詳細ログ
    console.log(`動的セグメント詳細:`);
    console.log(`- maxSegmentHeight (フロントエンド指定): ${maxSegmentHeight}px`);
    console.log(`- viewportHeight: ${pageInfo.viewportHeight}px`);
    console.log(`- 実際使用セグメント高さ: ${segmentHeight}px`);
    console.log(`- captureHeight (section2): ${captureHeight}px`);
    console.log(`- 計算セグメント数: ${segments}個`);
    console.log(`セグメント数: ${segments}, セグメント高さ: ${segmentHeight}px, 撮影範囲: ${captureHeight}px (class="section2")`)

    // セグメントが1つの場合は合成処理をスキップし、section2のみを切り抜く
    if (segments <= 1) {
      console.log('class="section2"の要素が1画面に収まるため、単一キャプチャと切り抜きを実行します。');

      if (captureHeight <= 0) {
        console.log('class="section2"の要素が見つからないか、サイズが0です。処理をスキップします。');
        return { success: true, files: [], segments: [], method: 'skipped' };
      }

      // スクロール可能性の判定
      const canScroll = pageInfo.totalHeight > pageInfo.viewportHeight;
      const maxScrollY = pageInfo.totalHeight - pageInfo.viewportHeight;
      
      console.log(`スクロール判定: canScroll=${canScroll}, totalHeight=${pageInfo.totalHeight}, viewportHeight=${pageInfo.viewportHeight}`);

      // section2が見えるようにスクロール
      let targetScrollY = 0;
      if (canScroll) {
        // スクロール可能な場合：section2の少し上から
        targetScrollY = Math.max(0, Math.min(scrollStart - 50, maxScrollY));
        console.log(`スクロール実行: ${targetScrollY}`);
        await mainWindow.webContents.executeJavaScript(`window.scrollTo(0, ${targetScrollY});`);
        await new Promise(resolve => setTimeout(resolve, 250));
      } else {
        // スクロール不要な場合：現在位置のまま
        console.log('ページが短いためスクロール不要');
        targetScrollY = 0;
      }

      const image = await mainWindow.webContents.capturePage();
      const imageBuffer = image.toPNG(); // toBuffer() ではなく toPNG() を使用

      // 画像のメタデータを確認
      const imageMeta = await sharp(imageBuffer).metadata();
      console.log(`キャプチャ画像サイズ: ${imageMeta.width}x${imageMeta.height}`);
      console.log(`セクション位置: top=${scrollStart}, height=${captureHeight}, スクロール先: ${targetScrollY}`);

      // sharp を使ってsection2の範囲で画像を切り抜く
      // スクロール位置調整後の座標計算
      const actualTop = Math.round((scrollStart - targetScrollY) * pageInfo.devicePixelRatio);
      
      // 切り抜き領域の計算と境界チェック
      let extractLeft = Math.round(captureLeft * pageInfo.devicePixelRatio);
      let extractTop = actualTop;
      let extractWidth = Math.round(captureWidth * pageInfo.devicePixelRatio);
      let extractHeight = Math.round(captureHeight * pageInfo.devicePixelRatio);
      
      // 境界チェック
      if (extractLeft + extractWidth > imageMeta.width) {
        console.log(`幅の調整: ${extractLeft + extractWidth} > ${imageMeta.width}`);
        extractWidth = imageMeta.width - extractLeft;
      }
      if (extractTop + extractHeight > imageMeta.height) {
        console.log(`高さの調整: ${extractTop + extractHeight} > ${imageMeta.height}`);
        extractHeight = imageMeta.height - extractTop;
      }
      
      console.log(`切り抜き領域: left=${extractLeft}, top=${extractTop}, width=${extractWidth}, height=${extractHeight}`);
      
      const croppedBuffer = await sharp(imageBuffer)
        .extract({
          left: extractLeft,
          top: extractTop,
          width: extractWidth,
          height: extractHeight
        })
        .png()
        .toBuffer();

      const finalFilename = `beat-archive-${datePrefix}-composite.png`;
      const finalPath = path.join(directory, finalFilename);
      await fs.writeFile(finalPath, croppedBuffer);
      console.log(`スクリーンショット保存完了: ${finalPath}`);

      return {
        success: true,
        files: [finalFilename],
        segments: [],
        method: 'crop'
      };
    } else {
      // セグメントが2つ以上の場合のみ合成処理
      const imageSegments = [];
      console.log(`class="section2"撮影開始: top=${scrollStart}, height=${captureHeight}`);

      for (let i = 0; i < segments; i++) {
        const scrollY = scrollStart + i * segmentHeight;
        const actualScrollY = Math.min(scrollY, pageInfo.totalHeight - pageInfo.viewportHeight);
        console.log(`セグメント ${i + 1}/${segments}: スクロール位置 ${actualScrollY}`);
        
        await mainWindow.webContents.executeJavaScript(`window.scrollTo(0, ${actualScrollY});`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const image = await mainWindow.webContents.capturePage();
        const imageBuffer = image.toPNG();
        const segmentFilename = `beat-archive-${datePrefix}-segment${i + 1}.png`;
        const segmentPath = path.join(directory, segmentFilename);
        await fs.writeFile(segmentPath, imageBuffer);
        
        imageSegments.push({
          buffer: imageBuffer,
          scrollY: actualScrollY,
          segmentIndex: i,
          filename: segmentFilename
        });
      }
      
      await mainWindow.webContents.executeJavaScript('window.scrollTo(0, 0);');
      console.log('画像合成処理を開始...');
      
      let compositeImage = sharp(imageSegments[0].buffer);
      const firstImageMeta = await compositeImage.metadata();
      const totalCompositeHeight = Math.round(captureHeight * pageInfo.devicePixelRatio);
      
      compositeImage = sharp({
        create: {
          width: firstImageMeta.width,
          height: totalCompositeHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      });
      
      const composite = [];
      for (let i = 0; i < imageSegments.length; i++) {
        const segment = imageSegments[i];
        const top = Math.round((segment.scrollY - scrollStart) * pageInfo.devicePixelRatio);
        composite.push({
          input: segment.buffer,
          top: Math.max(0, top),
          left: 0
        });
      }
      
      const finalImageBuffer = await compositeImage.composite(composite).png().toBuffer();
      
      // section2の範囲で切り抜き
      // まず画像の実際のサイズを確認
      const finalImageMeta = await sharp(finalImageBuffer).metadata();
      console.log(`合成画像サイズ: ${finalImageMeta.width}x${finalImageMeta.height}`);
      
      // 切り抜き領域の計算
      let extractLeft = Math.round(captureLeft * pageInfo.devicePixelRatio);
      let extractWidth = Math.round(captureWidth * pageInfo.devicePixelRatio);
      let extractHeight = Math.round(captureHeight * pageInfo.devicePixelRatio);
      
      // 境界チェック
      if (extractLeft + extractWidth > finalImageMeta.width) {
        console.log(`幅の調整: ${extractLeft + extractWidth} > ${finalImageMeta.width}`);
        extractWidth = finalImageMeta.width - extractLeft;
      }
      if (extractHeight > finalImageMeta.height) {
        console.log(`高さの調整: ${extractHeight} > ${finalImageMeta.height}`);
        extractHeight = finalImageMeta.height;
      }
      
      console.log(`切り抜き領域: left=${extractLeft}, top=0, width=${extractWidth}, height=${extractHeight}`);
      
      const croppedBuffer = await sharp(finalImageBuffer)
        .extract({
          left: extractLeft,
          top: 0,
          width: extractWidth,
          height: extractHeight
        })
        .png()
        .toBuffer();
      
      const finalFilename = `beat-archive-${datePrefix}-composite.png`;
      const finalPath = path.join(directory, finalFilename);
      await fs.writeFile(finalPath, croppedBuffer);
      console.log(`class="section2"スクリーンショット保存完了: ${finalPath}`);
      
      const finalImage = sharp(croppedBuffer);
      const finalMeta = await finalImage.metadata();
      
      console.log(`最終画像メタデータ: ${finalMeta.width}x${finalMeta.height}, 分割閾値: ${maxSegmentHeight}px`);
      
      if (finalMeta.height <= maxSegmentHeight) {
        return {
          success: true,
          files: [finalFilename],
          segments: imageSegments.map(seg => seg.filename),
          method: 'composite'
        };
      } else {
        // 分割処理前の画像整合性チェック
        try {
          // 小さなテスト抽出を実行して画像の有効性を確認
          await finalImage.extract({ left: 0, top: 0, width: Math.min(100, finalMeta.width), height: Math.min(100, finalMeta.height) }).png().toBuffer();
          console.log('画像整合性チェック: OK - 分割処理を続行');
        } catch (integrityError) {
          console.log(`画像整合性チェック失敗: ${integrityError.message}`);
          console.log('分割処理をスキップし、単一ファイルとして保存');
          return {
            success: true,
            files: [finalFilename],
            segments: imageSegments.map(seg => seg.filename),
            method: 'composite (integrity check failed)'
          };
        }
        
        const savedFiles = [];
        let i = 0;
        console.log(`画像分割処理開始: 画像サイズ ${finalMeta.width}x${finalMeta.height}, maxSegmentHeight=${maxSegmentHeight}`);
        while (true) {
          const cropTop = Math.floor(i * maxSegmentHeight);
          if (cropTop >= finalMeta.height) break;
          let cropHeight = Math.floor(maxSegmentHeight);
          if (cropTop + cropHeight > finalMeta.height) {
            cropHeight = Math.floor(finalMeta.height - cropTop);
          }
          if (cropHeight <= 0) break;
          
          console.log(`分割 ${i + 1}: top=${cropTop}, height=${cropHeight}, left=0, width=${finalMeta.width}`);
          console.log(`計算詳細: i=${i}, maxSegmentHeight=${maxSegmentHeight}`);
          console.log(`計算値: i * maxSegmentHeight = ${i * maxSegmentHeight}`);
          
          // 厳密な境界チェック
          if (cropTop < 0 || cropHeight <= 0 || cropTop + cropHeight > finalMeta.height || finalMeta.width <= 0) {
            console.log(`無効な分割領域をスキップ: top=${cropTop}, height=${cropHeight}, 画像サイズ=${finalMeta.width}x${finalMeta.height}`);
            break;
          }
          
          // 整数値に確実に変換
          const extractLeft = 0;
          const extractTop = Math.max(0, Math.floor(cropTop));
          let extractWidth = Math.max(1, Math.floor(finalMeta.width));
          let extractHeight = Math.max(1, Math.floor(cropHeight));
          
          // 最終的な境界チェック（より保守的な安全マージンを確保）
          if (extractTop + extractHeight >= Math.floor(finalMeta.height)) {
            extractHeight = Math.floor(finalMeta.height) - extractTop;
            if (extractHeight > 2) {
              extractHeight = Math.max(1, extractHeight - 2); // 安全マージンとして2ピクセル減らす
            }
          }
          if (extractWidth > Math.floor(finalMeta.width)) {
            extractWidth = Math.floor(finalMeta.width);
          }
          
          console.log(`実際の抽出領域: left=${extractLeft}, top=${extractTop}, width=${extractWidth}, height=${extractHeight}`);
          console.log(`画像メタデータ: width=${finalMeta.width}, height=${finalMeta.height}`);
          console.log(`境界チェック: extractTop + extractHeight = ${extractTop + extractHeight}, finalMeta.height = ${finalMeta.height}`);
          
          if (extractHeight <= 0 || extractWidth <= 0) {
            console.log(`抽出領域が無効（サイズ0以下）: width=${extractWidth}, height=${extractHeight}`);
            break;
          }
          
          // さらに厳密な境界チェック
          if (extractTop >= finalMeta.height || extractLeft >= finalMeta.width || 
              extractTop + extractHeight > finalMeta.height || extractLeft + extractWidth > finalMeta.width ||
              extractHeight <= 0 || extractWidth <= 0) {
            console.log(`抽出領域が画像範囲外: extractTop=${extractTop}, extractLeft=${extractLeft}, extractWidth=${extractWidth}, extractHeight=${extractHeight}, 画像サイズ=${finalMeta.width}x${finalMeta.height}`);
            break;
          }
          
          // Sharp用の最終安全チェック（より厳密な境界確保）
          const safeExtractHeight = Math.min(extractHeight, finalMeta.height - extractTop - 1); // 1ピクセル余裕を持たせる
          const safeExtractWidth = Math.min(extractWidth, finalMeta.width - extractLeft);
          
          // 最小サイズ確保
          if (safeExtractHeight <= 0 || safeExtractWidth <= 0) {
            console.log(`安全化後の領域サイズが無効: width=${safeExtractWidth}, height=${safeExtractHeight}`);
            break;
          }
          
          console.log(`安全化後の抽出領域: left=${extractLeft}, top=${extractTop}, width=${safeExtractWidth}, height=${safeExtractHeight}`);
          
          try {
            const partBuffer = await finalImage.extract({
              left: extractLeft,
              top: extractTop,
              width: safeExtractWidth,
              height: safeExtractHeight
            }).png().toBuffer();
            const partFilename = `beat-archive-${datePrefix}_part${i + 1}.png`;
            const partPath = path.join(directory, partFilename);
            await fs.writeFile(partPath, partBuffer);
            savedFiles.push(partFilename);
          } catch (extractError) {
            console.log(`セグメント${i + 1}の抽出でエラーが発生、スキップします: ${extractError.message}`);
            console.log(`エラー詳細: left=${extractLeft}, top=${extractTop}, width=${safeExtractWidth}, height=${safeExtractHeight}`);
            // エラーが発生した場合はそのセグメントをスキップして続行
          }
          i++;
        }
        
        // 分割処理の成功率をチェック
        const expectedSegments = Math.ceil(finalMeta.height / maxSegmentHeight);
        const successRate = savedFiles.length / expectedSegments;
        console.log(`分割処理結果: ${savedFiles.length}/${expectedSegments}セグメント成功 (成功率: ${(successRate * 100).toFixed(1)}%)`);
        
        // 成功率が低い場合は単一ファイルとして保存
        if (successRate < 0.5) {
          console.log('分割処理の成功率が低いため、単一ファイルとして保存します');
          // 作成済みの分割ファイルを削除
          for (const file of savedFiles) {
            try {
              const partPath = path.join(directory, file);
              await fs.unlink(partPath);
            } catch (deleteError) {
              console.log(`分割ファイル削除エラー: ${deleteError.message}`);
            }
          }
          return {
            success: true,
            files: [finalFilename],
            segments: imageSegments.map(seg => seg.filename),
            method: 'composite (split failed)'
          };
        }
        
        if (savedFiles.length === 1) {
          const partPath = path.join(directory, savedFiles[0]);
          await fs.unlink(partPath);
          
          // configに最新のスクリーンショットパスを保存（compressed版を優先）
          const compressedPath = finalFilename.replace(/(\.[^.]+)$/, '_compressed$1');
          try {
            await fs.access(compressedPath);
            config.lastScreenshotPath = compressedPath;
          } catch {
            config.lastScreenshotPath = finalFilename;
          }
          config.lastScreenshotDirectory = directory;
          saveConfig();
          
          return {
            success: true,
            files: [finalFilename],
            segments: imageSegments.map(seg => seg.filename),
            method: 'composite'
          };
        }
        
        // 分割ファイルの場合、最初のファイルのcompressed版があればそれを保存
        if (savedFiles.length > 0) {
          const firstFile = path.join(directory, savedFiles[0]);
          const compressedPath = firstFile.replace(/(\.[^.]+)$/, '_compressed$1');
          
          try {
            await fs.access(compressedPath);
            config.lastScreenshotPath = compressedPath;
          } catch {
            config.lastScreenshotPath = firstFile;
          }
          config.lastScreenshotDirectory = directory;
          saveConfig();
        }
        
        return {
          success: true,
          files: savedFiles,
          segments: imageSegments.map(seg => seg.filename),
          method: 'split'
        };
      }
    }
  } catch (error) {
    console.error('スクロールスクリーンショット撮影エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// スクリーンショット撮影（既存）
ipcMain.handle('take-screenshot', async (_, directory, filename, bounds) => {
  const { nativeImage } = require('electron');
  const path = require('path');
  const fs = require('fs').promises;
  
  try {
    // メインウィンドウを取得
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('ウィンドウが見つかりません');
    }
    
    let image;
    
    if (bounds === null || bounds === undefined) {
      // bounds未指定の場合はページ全体をキャプチャ
      console.log('ページ全体をキャプチャ中...');
      image = await mainWindow.webContents.capturePage();
    } else {
      // デバイスピクセル比を取得
      const devicePixelRatio = await mainWindow.webContents.executeJavaScript('window.devicePixelRatio');
      
      // 座標をデバイスピクセル比で調整
      const scaledBounds = {
        x: Math.round(bounds.x * devicePixelRatio),
        y: Math.round(bounds.y * devicePixelRatio),
        width: Math.round(bounds.width * devicePixelRatio),
        height: Math.round(bounds.height * devicePixelRatio)
      };
      
      console.log('Original bounds:', bounds);
      console.log('Device pixel ratio:', devicePixelRatio);
      console.log('Scaled bounds:', scaledBounds);
      
      image = await mainWindow.webContents.capturePage(scaledBounds);
    }
    
    // ファイルパスを構築
    const filePath = path.join(directory, filename);
    
    // PNGとして保存
    const buffer = image.toPNG();
    await fs.writeFile(filePath, buffer);
    
    console.log(`スクリーンショット保存完了: ${filePath}`);
    return filePath;
    
  } catch (error) {
    console.error('スクリーンショット撮影エラー:', error);
    throw error;
  }
});


// 画像分割処理
ipcMain.handle('split-image', async (_, imagePath, maxHeight, datePrefix) => {
  const { nativeImage } = require('electron');
  const path = require('path');
  const fs = require('fs').promises;
  
  try {
    console.log(`画像分割処理開始: ${imagePath}, maxHeight: ${maxHeight}`);
    
    // 画像を読み込み
    const imageBuffer = await fs.readFile(imagePath);
    const image = nativeImage.createFromBuffer(imageBuffer);
    const imageSize = image.getSize();
    
    console.log(`画像サイズ: ${imageSize.width} x ${imageSize.height}`);
    
    if (imageSize.height <= maxHeight) {
      // 分割不要の場合、元の画像をリネーム
      const directory = path.dirname(imagePath);
      const finalFilename = `beat-archive-${datePrefix}.png`;
      const finalPath = path.join(directory, finalFilename);
      
      await fs.copyFile(imagePath, finalPath);
      await fs.unlink(imagePath); // 元のフルサイズ画像を削除
      
      return {
        success: true,
        files: [finalFilename]
      };
    } else {
      // 分割処理
      const parts = Math.ceil(imageSize.height / maxHeight);
      const savedFiles = [];
      const directory = path.dirname(imagePath);
      
      for (let i = 0; i < parts; i++) {
        const cropY = i * maxHeight;
        const cropHeight = Math.min(maxHeight, imageSize.height - cropY);
        
        console.log(`Part ${i + 1}/${parts}: Y=${cropY}, Height=${cropHeight}`);
        
        // 画像を切り抜き
        const croppedImage = image.crop({
          x: 0,
          y: cropY,
          width: imageSize.width,
          height: cropHeight
        });
        
        // ファイル名を生成
        const partFilename = `beat-archive-${datePrefix}_part${i + 1}of${parts}.png`;
        const partPath = path.join(directory, partFilename);
        
        // 切り抜いた画像を保存
        const croppedBuffer = croppedImage.toPNG();
        await fs.writeFile(partPath, croppedBuffer);
        
        savedFiles.push(partFilename);
        console.log(`分割画像保存完了: ${partPath}`);
      }
      
      // 元のフルサイズ画像を削除
      await fs.unlink(imagePath);
      
      return {
        success: true,
        files: savedFiles
      };
    }
    
  } catch (error) {
    console.error('画像分割エラー:', error);
    return {
      success: false,
      error: error.message
    };
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

// 外部ブラウザでURLを開く
ipcMain.handle('open-external', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// MD5からSHA256に変換
ipcMain.handle('convert-md5-to-sha256', async (_, md5) => {
  console.log('Converting MD5 to SHA256:', md5);
  
  try {
    const songdataPath = config.dbPaths?.songdata;
    
    if (!songdataPath || !fs.existsSync(songdataPath)) {
      console.log('Songdata database not found');
      return null;
    }
    
    const db = new sqlite3.Database(songdataPath, sqlite3.OPEN_READONLY);
    
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT sha256 FROM song WHERE md5 = ?',
        [md5],
        (err, row) => {
          db.close();
          
          if (err) {
            console.error('Error querying songdata database:', err);
            reject(err);
            return;
          }
          
          if (row && row.sha256) {
            console.log(`Converted MD5 ${md5} to SHA256 ${row.sha256}`);
            resolve(row.sha256);
          } else {
            console.log(`No SHA256 found for MD5 ${md5}`);
            resolve(null);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in convert-md5-to-sha256:', error);
    return null;
  }
});

// クリップボードコピー機能
ipcMain.handle('copy-to-clipboard', async (_, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return { success: false, error: error.message };
  }
});

// 画像をクリップボードにコピーする機能
ipcMain.handle('copy-image-to-clipboard', async (_, imagePath) => {
  try {
    const { nativeImage, clipboard } = require('electron');
    
    // 画像ファイルを読み込み
    const image = nativeImage.createFromPath(imagePath);
    
    if (image.isEmpty()) {
      return { success: false, error: '画像ファイルが読み込めませんでした' };
    }
    
    // クリップボードに画像をコピー
    clipboard.writeImage(image);
    
    return { success: true };
  } catch (error) {
    console.error('Error copying image to clipboard:', error);
    return { success: false, error: error.message };
  }
});

// スマートビューウィンドウを開く機能
ipcMain.handle('smart-view-window', () => {
  createSmartViewWindow();
});

// Smart View統計情報の保存機能
ipcMain.handle('save-smart-view-stats', async (_, stats) => {
  try {
    const statsPath = path.join(__dirname, 'src', 'windows', 'smartview', 'smartview-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log('Smart View統計情報を保存しました:', statsPath);
    return true;
  } catch (error) {
    console.error('Smart View統計情報の保存に失敗しました:', error);
    return false;
  }
});

// Smart View統計情報の読み込み機能
ipcMain.handle('load-smart-view-stats', async () => {
  try {
    const statsPath = path.join(__dirname, 'src', 'windows', 'smartview', 'smartview-stats.json');
    if (fs.existsSync(statsPath)) {
      const statsData = fs.readFileSync(statsPath, 'utf8');
      const stats = JSON.parse(statsData);
      console.log('Smart View統計情報を読み込みました');
      return stats;
    } else {
      console.log('Smart View統計情報ファイルが見つかりません');
      return null;
    }
  } catch (error) {
    console.error('Smart View統計情報の読み込みに失敗しました:', error);
    return null;
  }
});

// Smart Viewスクリーンショット撮影機能
ipcMain.handle('take-smartview-screenshots', async () => {
  try {
    const os = require('os');
    const username = os.userInfo().username;
    const screenshotDir = path.join('C:', 'Users', username, 'Pictures', 'Beat-Archive');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      console.log('スクリーンショットディレクトリを作成しました:', screenshotDir);
    }
    
    // Smart Viewウィンドウを取得
    const smartViewWindow = BrowserWindow.getAllWindows().find(win => 
      win.webContents.getURL().includes('smartview.html')
    );
    
    if (!smartViewWindow) {
      throw new Error('Smart Viewウィンドウが見つかりません');
    }
    
    // 現在の日付をファイル名に使用
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
    
    // 既存の同日のスクリーンショットを削除（上書き準備）
    const existingFiles = fs.readdirSync(screenshotDir);
    const sameDateFiles = existingFiles.filter(file => 
      file.startsWith(`smartview_${dateStr}_`) && file.endsWith('.png')
    );
    
    if (sameDateFiles.length > 0) {
      console.log(`既存のスクリーンショット ${sameDateFiles.length} 枚を削除します:`, sameDateFiles);
      sameDateFiles.forEach(file => {
        const filePath = path.join(screenshotDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`削除完了: ${file}`);
        } catch (error) {
          console.error(`削除失敗: ${file}`, error);
        }
      });
    }
    
    // ページネーション情報を取得するためにJavaScriptを実行
    const paginationInfo = await smartViewWindow.webContents.executeJavaScript(`
      (() => {
        const totalPages = Math.ceil(filteredSongs.length / itemsPerPage);
        return { currentPage, totalPages, itemsPerPage };
      })()
    `);
    
    console.log('Pagination info:', paginationInfo);
    
    const screenshotPaths = [];
    
    // 各ページのスクリーンショットを撮影
    for (let page = 1; page <= paginationInfo.totalPages; page++) {
      // ページを移動
      await smartViewWindow.webContents.executeJavaScript(`
        currentPage = ${page};
        displayCurrentPage();
      `);
      
      // ページの描画を待つ
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // スクリーンショットを撮影（上書き）
      const filename = `smartview_${dateStr}_${timeStr}_page${page}.png`;
      const filePath = path.join(screenshotDir, filename);
      
      const image = await smartViewWindow.capturePage();
      fs.writeFileSync(filePath, image.toPNG());
      
      screenshotPaths.push(filePath);
      console.log(`Page ${page} screenshot saved (overwrite): ${filePath}`);
    }
    
    // 元のページに戻す（最初のページ）
    await smartViewWindow.webContents.executeJavaScript(`
      currentPage = 1;
      displayCurrentPage();
    `);
    
    console.log(`${screenshotPaths.length}枚のスクリーンショットを撮影しました（上書き保存）`);
    return {
      directory: screenshotDir,
      filePaths: screenshotPaths
    };
    
  } catch (error) {
    console.error('Smart Viewスクリーンショット撮影エラー:', error);
    throw error;
  }
});

// 外部URLを開く機能
ipcMain.handle('open-external-url', async (_, url) => {
  try {
    await shell.openExternal(url);
    console.log('外部URLを開きました:', url);
    return { success: true };
  } catch (error) {
    console.error('外部URL起動エラー:', error);
    throw error;
  }
});

// Discord送信機能
ipcMain.handle('send-to-discord', async (_, webhookUrl, message, screenshotData) => {
  try {
    console.log('Discord送信開始:', { 
      webhookUrl: webhookUrl.substring(0, 50) + '...', 
      message: message.substring(0, 100) + '...', 
      screenshotCount: screenshotData.filePaths ? screenshotData.filePaths.length : 0 
    });
    
    // 撮影されたスクリーンショットファイルを使用
    const screenshotPaths = screenshotData.filePaths || [];
    
    console.log('送信するスクリーンショット:', screenshotPaths.length, '枚');
    
    if (screenshotPaths.length === 0) {
      throw new Error('送信するスクリーンショットファイルがありません');
    }
    
    // FormDataを使用してマルチパート送信
    const form = new FormData();
    
    // Discord Embed形式でメッセージを作成
    const embedData = {
      embeds: [{
        title: '🎵 Beat Archive - プレイ記録',
        description: message,
        color: 0x7289da, // Discord blue
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Beat Archive Smart View'
        }
      }]
    };
    
    form.append('payload_json', JSON.stringify(embedData));
    
    // スクリーンショットを添付（最大10枚まで）
    const maxFiles = Math.min(screenshotPaths.length, 10);
    for (let i = 0; i < maxFiles; i++) {
      const filePath = screenshotPaths[i];
      const fileName = path.basename(filePath);
      const fileStream = fs.createReadStream(filePath);
      form.append(`files[${i}]`, fileStream, fileName);
    }
    
    // Discord WebhookにPOST送信
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (response.ok) {
      console.log('Discord送信成功');
      return {
        success: true,
        imageCount: maxFiles
      };
    } else {
      const errorText = await response.text();
      console.error('Discord送信失敗:', response.status, errorText);
      throw new Error(`Discord送信失敗: ${response.status} - ${errorText}`);
    }
    
  } catch (error) {
    console.error('Discord送信エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Twitter投稿用ブラウザ開く機能
ipcMain.handle('open-twitter-post', async (_, text) => {
  try {
    // テキストをエンコード
    const encodedText = encodeURIComponent(text);
    // Twitter投稿URLを作成
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    
    // ブラウザでTwitter投稿ページを開く
    await shell.openExternal(twitterUrl);
    
    return { success: true };
  } catch (error) {
    console.error('Error opening Twitter:', error);
    return { success: false, error: error.message };
  }
});

// 最後に保存されたスクリーンショットのパスを取得
ipcMain.handle('get-last-screenshot-path', () => {
  return {
    path: config.lastScreenshotPath,
    directory: config.lastScreenshotDirectory
  };
});

// 最後のスクリーンショットパスを更新
ipcMain.handle('update-last-screenshot-path', (event, imagePath, directory) => {
  try {
    console.log(`[main.js] 最後のスクリーンショットパスを更新: ${imagePath}`);
    config.lastScreenshotPath = imagePath;
    config.lastScreenshotDirectory = directory;
    
    // configファイルに保存
    saveConfig();
    
    return {
      success: true,
      path: config.lastScreenshotPath,
      directory: config.lastScreenshotDirectory
    };
  } catch (error) {
    console.error('[main.js] スクリーンショットパス更新エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ディレクトリをエクスプローラで開く
ipcMain.handle('open-directory', async (event, directoryPath) => {
  try {
    console.log('[main.js] ディレクトリを開く:', directoryPath);
    
    if (!directoryPath || !fs.existsSync(directoryPath)) {
      console.error('[main.js] ディレクトリが存在しません:', directoryPath);
      return {
        success: false,
        error: 'ディレクトリが存在しません'
      };
    }
    
    await shell.openPath(directoryPath);
    console.log('[main.js] ディレクトリを正常に開きました:', directoryPath);
    
    return {
      success: true,
      path: directoryPath
    };
  } catch (error) {
    console.error('[main.js] ディレクトリを開く際のエラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});