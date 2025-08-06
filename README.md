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

## GitHub Actions

このプロジェクトには以下のGitHub Actionsワークフローが設定されています：

### CI/CD ワークフロー

1. **CI (`ci.yml`)**
   - プッシュ・プルリクエスト時の軽量なビルドチェック
   - Windows版のクイックビルド

2. **Build and Release (`release.yml`)**
   - Windows向けの自動ビルド
   - タグプッシュ時の自動リリース作成
   - ポータブル版の作成

3. **Build Beat Archive (`build.yml`)**
   - Windows向けフル機能ビルドワークフロー
   - リリースアセットの自動アップロード

### ビルド成果物

- **Windows**: `.exe` インストーラー および ポータブル版

### リリース方法

1. **バージョンアップとリリース**:
   ```bash
   # パッチバージョン更新 (1.1.0 → 1.1.1)
   npm run version:patch
   
   # マイナーバージョン更新 (1.1.0 → 1.2.0)
   npm run version:minor
   
   # メジャーバージョン更新 (1.1.0 → 2.0.0)
   npm run version:major
   ```

2. **手動でのタグ作成**:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

3. GitHub Actionsが自動的にビルドしてリリースを作成します

### バージョン管理

- バージョン番号は[セマンティックバージョニング](https://semver.org/)に従います
- 変更履歴は`CHANGELOG.md`で管理します
- リリースは自動化されており、タグプッシュで実行されます
