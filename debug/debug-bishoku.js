const https = require('https');

// 美食研究会の難易度表データを取得して構造を確認
async function checkBishokuStructure() {
  try {
    console.log('=== 美食研究会データ構造確認 ===');
    
    // ヘッダー情報を取得
    const headerUrl = 'https://yuhi-dosei.github.io/EATorDIE-human/header.json';
    console.log('ヘッダーURL:', headerUrl);
    
    const header = await fetchJson(headerUrl);
    console.log('ヘッダー情報:', JSON.stringify(header, null, 2));
    
    // データURL
    const dataUrl = header.data_url;
    console.log('データURL:', dataUrl);
    
    // データを取得
    const data = await fetchJson(dataUrl);
    console.log('データ構造:');
    console.log('- isArray:', Array.isArray(data));
    console.log('- length:', data.length);
    console.log('- 最初の要素:', JSON.stringify(data[0], null, 2));
    console.log('- 最初の要素のプロパティ:', Object.keys(data[0] || {}));
    
    if (data.length > 1) {
      console.log('- 2番目の要素:', JSON.stringify(data[1], null, 2));
    }
    
    // レベル別にグループ化されているかどうかを確認
    if (data[0] && data[0].songs) {
      console.log('レベル別グループ構造を検出');
      console.log('- 最初のレベルの楽曲数:', data[0].songs.length);
      if (data[0].songs.length > 0) {
        console.log('- 最初の楽曲:', JSON.stringify(data[0].songs[0], null, 2));
      }
    } else if (data[0] && data[0].sha256) {
      console.log('フラットな楽曲リスト構造を検出');
      console.log('- 楽曲のプロパティ:', Object.keys(data[0]));
    } else {
      console.log('未知の構造:', JSON.stringify(data[0], null, 2));
    }
    
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return fetchJson(redirectUrl).then(resolve).catch(reject);
        }
      }
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

checkBishokuStructure();
