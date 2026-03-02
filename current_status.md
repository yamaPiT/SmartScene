# Current Project Status & Architecture

## 1. プロジェクト進捗概要
現在、**Phase 14 (Documentation & Final Verification)** まで完了しており、シミュレータの機能実装、VSS準拠のデータ構造化、シナリオエディタの高度化、およびJDM/NCES仕様へのビジュアル刷新が完了しています。

*   **実装完了**:
    *   **Vehicle Simulator**: VSS (Vehicle Signal Specification) に準拠した状態管理と物理挙動シミュレーション。
    *   **Scenario Editor**: 再帰的データ構造(AST)を用いたビジュアルプログラミング環境。
    *   **Visuals**: JDM (右ハンドル)、NCESデザイン、アニメーション（ワイパー、ウインカー）。
    *   **Logic**: サンキューハザード（開始時距離測定方式）、雨天連動制御。

## 2. 最新アーキテクチャ

### 2.1 データ構造 (VSS準拠 `VehicleState`)
`src/lib/types.ts` に定義。標準VSSに加え、アプリ固有の拡張を含みます。

*   **標準VSS (抜粋)**:
    *   `Vehicle.Speed`: 車速 (km/h)
    *   `Vehicle.Exterior.Air.RainIntensity`: 雨量 (%)
    *   `Vehicle.Body.Windshield.Wiper.Mode`: ワイパーモード
    *   `Vehicle.ADAS.ObstacleDetection.Rear.Distance`: 後方車間距離 (m)
*   **拡張ステート (Internal)**:
    *   `Internal.LaneChangeStatus`: `NONE` | `CHANGING` | `COMPLETED`
    *   `Internal.LaneChangeStartTime`: 車線変更開始時刻
    *   `Internal.LaneChangeStartRearDistance`: **[New]** 車線変更開始時の距離スナップショット

### 2.2 状態管理 (Zustand Store)
`src/lib/store.ts` に実装。Reactコンポーネント外からもアクセス可能な中央集権ストアです。

*   **Store構成**:
    *   `VehicleState`: 平坦化されたキーバリューペア。
    *   `scenarios`: シナリオのAST（抽象構文木）ツリー。
*   **主要アクション**:
    *   `setVss(key, value)`: VSSシグナルの単一更新。
    *   `updateState(partialState)`: 物理ループからのバッチ更新。
    *   `resetScenarios(defaults)`: シナリオの初期化（リセット機能）。
    *   **AST操作**: `addScenarioNode`, `updateScenarioNode`, `deleteScenarioNode` (再帰的更新ロジック)。

### 2.3 シナリオエディタ & 実行エンジン
`src/components/scenario/` に実装。

*   **データ構造 (AST)**:
    *   `BLOCK`: 複数の子アクションを持つコンテナ。
    *   `IF`: 条件分岐 (`condition`, `thenBody`, `elseBody`)。
    *   `ACTION`: VSS信号の変更 (`target`, `value`)。
    *   `WAIT`: 時間待機 (`duration`)。
*   **Editor UI (`ScenarioEditor.tsx`)**:
    *   再帰的コンポーネントによるツリー表示。
    *   動的なノード追加・削除・編集。
    *   **Reset機能**: ブラウザキャッシュをクリアし、最新のデフォルトシナリオ（30m判定）をロード。
*   **実行エンジン**:
    *   100ms周期でループ実行。
    *   現在の `VehicleState` を評価し、条件合致時にアクションを発火。

## 3. 現在の主要ロジック（サンキューハザード）
ユーザー要望に基づき、以下の「測定と実行の分離」アルゴリズムを実装しています。

1.  **測定 (Trigger)**:
    *   ウインカーONの瞬間、その時の `Rear.Distance` を `Internal.LaneChangeStartRearDistance` に保存。
2.  **待機 (Process)**:
    *   10秒間の車線変更アニメーション（この間、距離変数は保持される）。
3.  **判定 (Evaluate)**:
    *   車線変更完了後、保存された `Internal.LaneChangeStartRearDistance` が **30m未満** であるかを判定。
4.  **実行 (Action)**:
    *   条件を満たせばハザードを3秒間点灯。
