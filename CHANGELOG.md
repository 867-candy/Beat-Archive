# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [1.1.7] - 2025-08-08

### Added
- 更新曲スクリーンショット機能

### Changed
- ナビゲーションのpaddingを削除
- electronのメニューバーを非表示に変更
- プレイ統計に日付を表示するように変更
- プレイ統計のフォントサイズを大きくするよう変更

### Fixed
- 更新曲にて#subtitleが出ない不具合の修正
- NOPLAYから途中でやめた場合にミスカウントが正常に表示されない不具合の修正

## [1.1.6] - 2025-08-06

### Added
- 更新曲一覧で使用する難易度表の選択機能
- 複数の難易度表を更新曲一覧で使用できる機能

### Changed
- 難易度表設定で各表にチェックボックスを追加し、複数選択を可能に
- デフォルト難易度表の選択UIを複数選択方式に変更
- 設定データ構造をdefaultTableUrlからdefaultTableUrls（配列）に変更
- チェックボックス変更時の即座設定保存機能
- 更新曲一覧で選択された難易度表のみを使用するように変更
- 難易度表読み込みのパフォーマンスを改善（選択されたテーブルのみ読み込み）

### Fixed

## [1.1.5] - 2025-08-06

### Added


### Changed

- GitHub Actions ワークフローの権限設定を修正

### Fixed

- GitHub Actions リリースワークフローのファイルパターンマッチング問題を修正

## [1.1.4] - 2025-08-06

### Added
- フォルダ選択によるDBファイル自動検出機能
- DBファイル検出状況の視覚的表示

### Changed
- 設定ページの表名入力を削除
- DBファイルの設定にて、Playerフォルダを指定すると関連ファイルを読み込むように変更
- GitHub Actions ワークフローの権限設定を修正

### Fixed
- 難易度表を読み込んでいないときの楽曲別クリア状況のレベルフィルタの表記を修正
- 難易度表設定のダイアログを分けて出すように修正
- GitHub Actions リリースワークフローのファイルパターンマッチング問題を修正 

## [1.1.3] - 2025-08-06

### Changed

### Fixed
- MAX,FCの楽曲別クリア状況のホバー色が変化しない不具合を修正
- FAILEDのホバー色が暗い問題を修正

## [1.1.2] - 2025-08-05

### Changed
- 楽曲別クリア状況のホバー色をクリアタイプに応じて変更するように修正
- 難易度表の選択に使用するプルダウンメニューの並びに難易度表の優先度を使用するように変更

### Fixed
- Overjoyの★★0が★★?になる不具合を修正

## [1.1.1] - 2025-08-05

### Added
- GitHub Actions による自動ビルド・リリース機能
- レベル別クリア状況,楽曲別クリア状況にてシンボルを表示するように変更
- レベル別クリア状況,楽曲別クリア状況に難易度表名を表示するように変更
- 難易度表の名前自動取得に対応

### Changed
- レベル別クリア状況の表示不具合を調整
- 難易度表の優先度入れ替えUIを改善

### Fixed
- MAX,PERFECTがUNKNOWNとなる不具合の修正
- レベルフィルタで0が最後尾にくる不具合を修正
- ミスカウントが0のときに999999となる不具合の修正

## [1.0.0] - 2025-08-05

### Added
- 初期リリース
- beatorajaスコア分析機能
- 前日差分表示機能
- 難易度表統合機能
- 統計表示機能

[Unreleased]: https://github.com/username/beat-archive/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/username/beat-archive/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/username/beat-archive/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/username/beat-archive/releases/tag/v1.0.0
