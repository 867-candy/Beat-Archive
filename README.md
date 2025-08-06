# Beat Archive

Beatorajaのスコアデータとプレイログを管理するElectronアプリケーション

## ディレクトリ構造

```
Beat-Archive/
├── main.js              # メインアプリケーション
├── preload.js           # Electronプリロードスクリプト
├── package.json         # Node.jsパッケージ設定
├── config.json          # アプリケーション設定
├── renderer/            # フロントエンドファイル
│   ├── index.html       # メイン画面
│   ├── renderer.js      # レンダラープロセス
│   ├── settings.html    # 設定画面
│   ├── settings.js      # 設定画面ロジック
│   ├── clearlamp.html   # クリアランプ画面
│   └── clearlamp.js     # クリアランプロジック
├── sample-db/           # サンプルデータベース
│   ├── score.db         # スコアデータ
│   ├── scorelog.db      # プレイログ
│   ├── scoredatalog.db  # 詳細プレイデータ
│   ├── songdata.db      # 楽曲メタデータ
│   └── songinfo.db      # 楽曲情報
├── debug/               # デバッグスクリプト
├── test/                # テストスクリプト
└── testdata/            # テストデータ作成スクリプト
```

## 主要機能

- **スコア管理**: beatorajaのスコアデータベースから情報を読み取り
- **前日差分表示**: scoredatalogベースの前日比較
- **難易度表統合**: 複数の難易度表からの情報取得
- **統計表示**: プレイ統計とノーツ数集計

## 使用方法

### アプリケーション起動
```bash
npm start
```

### 開発モード
```bash
npm run dev
```

## データベース

すべてのデータベースファイルは**読み取り専用**です：
- `score.db` - 現在のベストスコア
- `scoredatalog.db` - 詳細なプレイデータ（前日差分計算に使用）
- `scorelog.db` - プレイログ
- `songdata.db` - 楽曲メタデータ
- `songinfo.db` - 楽曲情報

## 開発・デバッグ

- デバッグスクリプト: `debug/` ディレクトリ
- テストスクリプト: `test/` ディレクトリ  
- テストデータ作成: `testdata/` ディレクトリ

詳細は各ディレクトリの`README.md`を参照してください。
