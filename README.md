# SMPLR — iPhone PWA Sampling Machine

A lightweight, browser-only sampling machine designed for iPhone Safari.
**録音 → 切り出し → パッド再生 → 16 ステップシーケンサ** までを 1 タップで往復できる MVP。

- React + TypeScript + Vite
- Web Audio API（Tone.js は採用せず、依存最小）
- IndexedDB に永続保存（PCM + パターン + プロジェクト）
- PWA（manifest + service worker、オフライン対応）
- ダーク／メタリック基調の UI

---

## 1. ディレクトリ構成

```
audio-sampling-machine/
├── index.html
├── package.json
├── tsconfig.json / tsconfig.node.json
├── vite.config.ts
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/        # 192/512/maskable/apple-touch
├── src/
│   ├── main.tsx               # SW 登録 + iOS gesture 対策 + StrictMode root
│   ├── App.tsx                # タブ振り分け + 起動オーバーレイ（AudioContext unlock）
│   ├── styles/global.css      # 全体テーマ（dark / metallic）
│   ├── types/index.ts         # ドメイン型（SampleMeta / Pattern / PadSlot 等）
│   ├── utils/helpers.ts       # uid / clamp / dB / semitone 等
│   ├── audio/
│   │   ├── AudioEngine.ts     # 単一 AudioContext / マスター / 発音 / スケジュール
│   │   ├── Recorder.ts        # getUserMedia + ScriptProcessor 録音
│   │   └── SampleProcessor.ts # trim / reverse / normalize / fade / resample / peaks
│   ├── storage/Storage.ts     # idb ラッパ（meta / pcm / patterns / project）
│   ├── state/useAppStore.ts   # Zustand ストア
│   └── components/
│       ├── Display.tsx        # 上部「LCD」
│       ├── TabBar.tsx         # 下部 4 タブ
│       ├── RecorderView.tsx   # マイク録音 + ファイル取り込み
│       ├── Waveform.tsx       # canvas 波形 + ドラッグでトリム
│       ├── SampleEditor.tsx   # 編集（pitch/gain/fade/reverse/normalize/trim bake）
│       ├── PadGrid.tsx        # 12 パッド + 割当シート
│       ├── Keyboard.tsx       # 2 オクターブ・ミニ鍵盤
│       └── Sequencer.tsx      # 4 トラック × 16 ステップ
```

---

## 2. 実装方針の要約

- **AudioEngine は 1 インスタンスのみ**：シングルトン化し、すべての発音を 1 つの `AudioContext` に集約。
- **iOS Audio unlock**：起動オーバーレイの「START」タップで `ctx.resume()` + サイレントバッファ再生。以後すべての操作で発音可能。
- **Sample は PCM (Float32) として IndexedDB に保存**：起動時にメタを全件、PCM は AudioEngine のキャッシュへ復元。
- **編集は非破壊 + bake**：トリム/フェード/ピッチ/ゲインはメタ更新で即時反映。リバース/ノーマライズ/トリム書き込みのみ PCM を上書き。
- **シーケンサは “lookahead scheduler”**：`setInterval(25ms)` で次 150ms 以内の発音を `audioCtx.currentTime` ベースで予約。視覚インジケータも `scheduleAt` で同期。
- **タッチ最適化**：パッド/鍵盤は `pointerdown/up/cancel/leave` で即時 trigger / release。`touch-action: none` でブラウザのジェスチャ干渉を排除。
- **依存最小**：`react`, `react-dom`, `zustand`, `idb` のみ。Tone.js は MVP では使わず、必要になったら差し替え可能な作り。

---

## 3. 起動手順

```bash
# 1) 依存インストール
npm install

# 2) 開発サーバ（LAN/iPhone から見るため --host）
npm run dev          # → http://localhost:5173 / http://<PCのIP>:5173

# 3) 本番ビルド + プレビュー
npm run build
npm run preview      # http://localhost:4173
```

> **HTTPS 必須**：マイク録音は localhost 以外 HTTPS でないと許可されません。
> 実機（iPhone）から確認する場合は後述の手順を参照。

---

## 4. iPhone 実機確認手順

iPhone Safari は **HTTPS** または **localhost** でないとマイクや SW を使えません。
おすすめは Vite のプロキシ／トンネル経由：

### A. ローカル LAN + 自己署名 HTTPS（最短）

`vite.config.ts` で `--https` を有効化するか、PC とトンネル経由（cloudflared / ngrok 等）で公開します。

```bash
# 例: cloudflared
cloudflared tunnel --url http://localhost:5173
# 表示された https://xxxx.trycloudflare.com を iPhone Safari で開く
```

### B. 共有 PC で `npm run preview`

```bash
npm run build
npm run preview
# ngrok http 4173 → iPhone Safari で https URL を開く
```

### 共通

1. iPhone Safari でアクセス
2. 共有ボタン → **「ホーム画面に追加」**
3. ホーム画面のアイコンから起動（standalone 表示になり、上下バーが消える）
4. 初回タップで START を押し、AudioContext を unlock
5. **REC** タブで録音 → **EDIT** で波形をドラッグしてトリム → **PLAY** でパッド/鍵盤 → **SEQ** で 16 ステップ

> 録音時に「マイクを許可しますか？」が出たら許可してください。
> 標準ブラウザ Safari で許可しないと PWA 側でも録音できません。

---

## 5. 機能対応マトリクス（MVP）

| 要件カテゴリ | 機能 | 実装 |
|---|---|---|
| 取得 | マイク録音 / ファイル読込 / 波形表示 / トリム / 名前変更 / 一覧 | ✅ |
| 編集 | ワンショット・ループ再生 / リバース / ピッチ / 音量 / フェード / ノーマライズ | ✅ |
| 演奏 | 12 パッド / タップ即時再生 / 2 オクターブ鍵盤（ピッチシフト） | ✅ |
| シーケンサ | 16 ステップ × 4 トラック / BPM / 再生停止 / ループ / 保存 / 複数パターン | ✅ |
| 保存 | サンプル / パターン / プロジェクト自動保存 / 再起動復元 / ストレージ警告 | ✅ |
| UI | dark/metallic / 押した感アニメ / 波形ビュー / ミニ鍵盤 | ✅ |
| PWA | manifest / SW / standalone / オフライン | ✅ |

---

## 6. 今後の拡張候補

- **エフェクト**：BiquadFilter / DelayNode / WaveShaper の挿入をパッド単位 or マスター単位で。Web Audio で十分軽量。
- **サンプルチョップ自動分割**：RMS のオンセット検出 → 自動でパッドに割当（SP-404 SX 風）。
- **レスポンシブ拡張**：iPad 横置きで `pad-grid` を 4×4 に、シーケンサを 32 ステップへ。
- **MIDI 対応**：Web MIDI API（iOS は WebMIDI Browser 等の経路）でパッドトリガとシーケンサ tempo sync。
- **エクスポート**：`OfflineAudioContext` で 1 パターンを WAV にレンダリングし、`<a download>` で書き出し。
- **クラウド同期**：プロジェクト JSON + サンプル Blob を Supabase / Cloudflare R2 へ。
- **AudioWorklet 移行**：録音やオンセット解析を Worklet 化して低レイテンシ + 安定化。

---

## 7. GitHub Pages へのデプロイ

このリポジトリには `.github/workflows/deploy-pages.yml` を同梱しています。
`main` または `claude/iphone-pwa-sampler-a3P35` への push で自動的に GitHub Pages にデプロイされます。

### 初回セットアップ（リポジトリ側）

1. GitHub のリポジトリ → **Settings** → **Pages**
2. **Source** を `GitHub Actions` に変更
3. （任意）`Settings → Environments → github-pages` のレビュー要件を確認
4. ワークフローが走った後、URL は
   ```
   https://yamamototakashi.github.io/audio-sampling-machine/
   ```

### ローカルで Pages 用ビルドを試す

```bash
BASE=/audio-sampling-machine/ npm run build
npx serve dist                              # http://localhost:3000/audio-sampling-machine/
# もしくは
npx http-server dist -c-1 -p 4173
```

> Pages 公開後は **HTTPS** で配信されるので、iPhone Safari の **マイク権限**と **PWA インストール** がそのまま動きます。
> iPhone Safari で URL を開く → 共有 → 「ホーム画面に追加」 → アイコンから起動 → **START** タップで AudioContext unlock。

### パスについて

- `vite.config.ts` で `base` を `BASE` 環境変数から決定。Actions 内で `BASE=/${repo}/` を渡しています。
- `index.html` / `manifest.webmanifest` / `icons` は **相対パス**で参照しているので、ルート配信／サブパス配信のどちらでも動作します。
- `sw.js` は自身の URL から base を計算し、その scope 内のリクエストだけを処理します。

---

## 8. iPhone Safari に関する注意（実装メモ）

- AudioContext は **必ずユーザー操作後**に resume。`App.tsx` の起動オーバーレイがその唯一の入口。
- 録音 ScriptProcessorNode は deprecated だが、iOS の互換性が高く MVP には十分。AudioWorklet 移行は拡張枠。
- `getUserMedia` は **HTTPS 必須**。PWA 化していてもオリジンが http のままだと録音できない。
- 巨大ファイル対策：取り込みも録音も **30 秒上限**で頭からカット。
- IndexedDB はストレージ圧迫時に Safari が evict することがある。`navigator.storage.persist()` を試行し、失敗時は UI に警告を表示。
- ジェスチャズーム抑止のため `gesturestart` を `preventDefault`、パッドは `touch-action: none`、`viewport` の `maximum-scale=1`。
