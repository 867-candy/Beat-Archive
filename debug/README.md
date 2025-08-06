# Debug Scripts

このディレクトリには、アプリケーションのデバッグとトラブルシューティングに使用するスクリプトが含まれています。

## ファイル一覧

### データベース関連
- `debug-asdf-data.js` - A.S.D.F [EX]のデータ確認
- `debug-database-comparison.js` - データベース間の比較確認
- `debug-db.js` - 汎用データベースデバッグ
- `debug-scoredatalog.js` - scoredatalogテーブルの確認
- `debug-scorelog.js` - scorelogテーブルの確認
- `debug-songdata.js` - songdataテーブルの確認
- `debug-songinfo.js` - songinfoテーブルの確認

### 機能関連
- `debug-find-asdf.js` - A.S.D.F楽曲の検索デバッグ
- `debug-real-multiplay.js` - 実際のマルチプレイデータの確認
- `debug-sha256-mapping.js` - SHA256マッピングの確認
- `debug-updates.js` - 更新情報のデバッグ
- `debug-bishoku.js` - 美食研究会データの確認

## 使用方法

```bash
cd /path/to/Beat-Archive
node debug/[ファイル名]
```

## 注意事項

- これらのスクリプトは読み取り専用です
- データベースファイルを変更することはありません
- 開発・デバッグ目的でのみ使用してください
