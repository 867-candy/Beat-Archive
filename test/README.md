# Test Scripts

このディレクトリには、アプリケーションの機能テストとベンチマークに使用するスクリプトが含まれています。

## ファイル一覧

### 機能テスト
- `test-asdf-example.js` - A.S.D.F [EX]ベストスコア差分テスト
- `test-checkbestscore.js` - ベストスコア確認テスト
- `test-daily-best-updates.js` - 日次ベスト更新テスト
- `test-date.js` - 日付処理テスト
- `test-multi-day-improvements.js` - 複数日改善テスト

### scoredatalog関連テスト
- `test-scoredatalog-diffs.js` - scoredatalog差分テスト
- `test-scoredatalog-diffs-v2.js` - scoredatalog差分テスト（改良版）
- `test-scoredatalog-implementation.js` - scoredatalog実装テスト

### UI/フロントエンドテスト
- `test-frontend-display.html` - フロントエンド表示テスト

## 使用方法

### JavaScriptテスト
```bash
cd /path/to/Beat-Archive
node test/[ファイル名]
```

### HTMLテスト
ブラウザで`test/test-frontend-display.html`を開いてください。

## 注意事項

- テストスクリプトは読み取り専用です
- 実際のデータベースファイルには影響しません
- テスト用データのみを使用します
