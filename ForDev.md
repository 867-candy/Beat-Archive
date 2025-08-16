## アーキテクチャ

### ディレクトリ設計
- **src/common/**: 全ウィンドウで共有する共通機能（CSS、アセット、ユーティリティ）
- **src/windows/**: ウィンドウごとに独立したファイル群（HTML、JS、CSS）
- **分離されたCSS**: 各ウィンドウの`styles.css`でインラインCSSを外部化

### CSS階層構造
- **common.css**: 全ウィンドウ共通のベーススタイル
- **各ウィンドウのstyles.css**: ウィンドウ固有のスタイル

## 使用方法

### アプリケーション起動
```bash
npm start
```

### 開発モード
```bash
npm run dev
```

## ディレクトリ構造

```
Beat-Archive/
├── package.json         # プロジェクト設定
├── main.js             # Electronメインプロセス
├── config.json         # アプリケーション設定
├── src/                # ソースコード
    ├── debug/          # デバッグ用スクリプト置き場
    ├── common/         # 共通ファイル
    │   ├── styles/     # 共通スタイルシート
    │   │   └── common.css # 全ウィンドウ共通のCSS
    │   ├── assets/     # 共通アセット
    │   │   └── icon/   # アイコンファイル
    │   └── utils.js    # 共通ユーティリティ関数
    ├── windows/        # ウィンドウごとのディレクトリ
    │   ├── main/       # メインウィンドウ
    │   │   ├── index.html    # メイン画面HTML
    │   │   ├── main-window.js   # メイン画面JS
    │   │   └── styles.css    # メイン画面専用CSS
    │   ├── settings/   # 設定ウィンドウ
    │   │   ├── settings.html # 設定画面HTML
    │   │   ├── settings-window.js   # 設定画面JS
    │   │   └── styles.css    # 設定画面専用CSS
    │   ├── smartview/  # スマートビューウィンドウ
    │   │   ├── smartview.html # スマートビューHTML
    │   │   ├── smartview-window.js    # スマートビューJS
    │   │   └── styles.css     # スマートビュー専用CSS
    │   └── clearlamp/  # クリアランプウィンドウ
    │       ├── clearlamp.html # クリアランプHTML
    │       ├── clearlamp-window.js    # クリアランプJS
    │       └── styles.css     # クリアランプ専用CSS
    └── preload.js      # Electronプリロードスクリプト

```

## データベース

すべてのデータベースファイルは**読み取り専用**です：
- `score.db` - 現在のベストスコア
- `scoredatalog.db` - 詳細なプレイデータ（前日差分計算に使用）
- `scorelog.db` - プレイログ
- `songdata.db` - 楽曲メタデータ
- `songinfo.db` - 楽曲情報


## GitHub Actions

このプロジェクトには以下のGitHub Actionsワークフローが設定されています：

### CI/CD ワークフロー

1. **CI (`ci.yml`)**
   - developブランチプッシュ時の開発用ビルドチェック
   - プルリクエスト時の品質チェック

2. **Build and Release (`release.yml`)**
   - タグプッシュ時（v*）の自動リリース作成
   - Windows向けインストーラーとポータブル版の自動ビルド

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
