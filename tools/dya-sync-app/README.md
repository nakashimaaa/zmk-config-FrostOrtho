# FrostOrtho DYA Sync

DYA Studio / Keyboard Abyssのエクスポートを検証し、FrostOrthoの
ファームウェア初期値とバックアップへ反映するWindows用アプリです。

## 同期される内容

- 8レイヤーのキー割り当て
- runtime combo defaults（最大16件）
- runtime macro defaults（最大16件）
- KeyboardHub JSONと生成`.keymap`の履歴

AML、トラックボール、Bluetooth、分割、センサーの定義は管理対象外です。
これらの設定は`config/FrostOrtho.keymap`とシールドoverlayに残されます。

## 使い方

1. DYA Studioで設定をキーボードへ保存します。
2. Keyboard Abyssから次の2ファイルをエクスポートします。
   - `KeyboardHubKeymap v1` (`*.keyboard-hub.json`)
   - `ZMK .keymap` (`*.keymap`)
3. GitHub Actionsの`FrostOrtho DYA Sync App`からWindows版を取得します。
4. アプリでFrostOrthoリポジトリと2ファイルを選択します。
5. `検証する`を押します。
6. 警告と件数を確認して`コミットしてプッシュ`を押します。
7. 表示されたActionsページでファームウェアのビルド結果を確認します。
8. GitHubの比較ページまたはForkで内容を確認してmainへマージします。

アプリは`origin/main`から`dya-sync/日時-識別子`ブランチを作成します。
mainへの直接プッシュや自動マージは行いません。

## 安全機構

- FrostOrtho、8レイヤー、各41キー、スキーマ版を検証
- 未知の`local-id:`とbinding種別を拒否
- 一時worktree内だけで変換
- 管理対象の3ファイルだけをステージ
- `git diff --check`が成功した場合だけコミット
- Windows Git Credential Managerを使用し、認証情報を保存しない
- プッシュ成否にかかわらず元の作業ツリーを変更しない

既知のKeyboard Abyss固有値`local-id:50397 134676523 0`は、
FrostOrthoのWindowsTabコンボ`&kp LG(TAB)`へ変換されます。

## 開発

Node.js 24とpnpm 11を使用します。

```powershell
cd tools/dya-sync-app
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

Windowsポータブル版を作成する場合:

```powershell
pnpm run dist
```

