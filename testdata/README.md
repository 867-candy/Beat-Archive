# Test Data Creation Scripts

このディレクトリには、テスト用データの作成と管理に使用するスクリプトが含まれています。

## ファイル一覧

### テストデータ作成
- `create-asdf-testdata.js` - A.S.D.F [EX]テストデータ作成
- `create-correct-asdf-testdata.js` - A.S.D.F [EX]正確なテストデータ作成（2012/2052）
- `create-local-db.js` - ローカルデータベース作成

### データ追加
- `add-asdf-scorelog.js` - scorelogにA.S.D.F [EX]データ追加
- `add-asdf-songdata.js` - songdataにA.S.D.F [EX]メタデータ追加

## 使用方法

```bash
cd /path/to/Beat-Archive
node testdata/[ファイル名]
```

## 機能詳細

### A.S.D.F [EX] テストケース
これらのスクリプトは、A.S.D.F [EX]楽曲で以下のテストケースを作成します：
- 8/3までのベストスコア: 2012
- 8/4のベストスコア: 2052
- 期待される差分: +40

### 影響範囲
- `sample-db/scoredatalog.db`
- `sample-db/songdata.db` 
- `sample-db/scorelog.db`（一部スクリプト）

## 注意事項

- **これらのスクリプトはテストデータベースを変更します**
- 本番環境では使用しないでください
- sample-dbディレクトリ内のファイルのみを対象とします
- main.js、clearlamp.js、settings.jsには影響しません
