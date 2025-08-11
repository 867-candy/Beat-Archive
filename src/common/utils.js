// 共通ユーティリティ関数

/**
 * 日付をフォーマットする
 * @param {Date|string} date - フォーマットする日付
 * @param {string} format - フォーマット形式 ('YYYY-MM-DD', 'YYYY/MM/DD', etc.)
 * @returns {string} フォーマットされた日付文字列
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  switch (format) {
    case 'YYYY/MM/DD':
      return `${year}/${month}/${day}`;
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * 数値を3桁区切りでフォーマットする
 * @param {number} num - フォーマットする数値
 * @returns {string} フォーマットされた数値文字列
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * ローディング表示を更新する
 * @param {HTMLElement} element - 更新する要素
 * @param {string} message - 表示メッセージ
 */
function showLoading(element, message = '読み込み中...') {
  element.innerHTML = `<li class="loading">${message}</li>`;
}

/**
 * エラー表示を更新する
 * @param {HTMLElement} element - 更新する要素
 * @param {string} error - エラーメッセージ
 */
function showError(element, error) {
  element.innerHTML = `<li style="color: #e74c3c; background: #fadbd8;">エラー: ${error}</li>`;
}

/**
 * 結果なし表示を更新する
 * @param {HTMLElement} element - 更新する要素
 * @param {string} message - 表示メッセージ
 */
function showNoResults(element, message) {
  element.innerHTML = `<li class="no-results">${message}</li>`;
}

/**
 * DJレベルの色を取得する
 * @param {string} level - DJレベル (AAA, AA, A, B, C, D, E, F)
 * @returns {string} 対応する色コード
 */
function getDJLevelColor(level) {
  const colors = {
    'AAA': '#FFD700',
    'AA': '#C0C0C0',
    'A': '#CD7F32',
    'B': '#4169E1',
    'C': '#32CD32',
    'D': '#FF8C00',
    'E': '#FF1493',
    'F': '#808080'
  };
  return colors[level] || '#808080';
}

/**
 * クリアランプの色を取得する
 * @param {string} clearType - クリアタイプ
 * @returns {string} 対応する色コード
 */
function getClearLampColor(clearType) {
  const colors = {
    'MAX': '#FF69B4',
    'PERFECT': '#FFD700',
    'FULL COMBO': '#00CED1',
    'EX HARD CLEAR': '#FF4500',
    'HARD CLEAR': '#FF6347',
    'CLEAR': '#32CD32',
    'EASY CLEAR': '#90EE90',
    'LIGHT ASSIST CLEAR': '#FFFF00',
    'ASSIST EASY CLEAR': '#FFA500',
    'FAILED': '#DC143C',
    'NO PLAY': '#808080'
  };
  return colors[clearType] || '#808080';
}

// Node.js環境で使用する場合
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDate,
    formatNumber,
    showLoading,
    showError,
    showNoResults,
    getDJLevelColor,
    getClearLampColor
  };
}
