/**
 * app.js
 * 兎に角 - 卓上QR・店舗印刷システム メインロジック
 * 触感アニメーション・即時印刷・バーチャルサーマルプリンター演出
 */

import { buildTableQrXml, buildCustomPrintXml } from './epos-builder.js?v=2.6';
import { TABLES_DATA } from './tables-data.js?v=2.6';

const DEFAULT_CONFIG = {
  storeName: '兎 に 角',
  paperWidth: '58', // Dinii設定連動: 58mm (35桁仕様 / 80mm用紙対応)
  qrSize: 6,
  soundEnabled: true,
  printDirection: 'bottom_up',
  showMemo: true
};

const TEMPLATES = {
  wifi: {
    title: '店内無料Wi-Fi',
    body: 'SSID: Tonikaku_Guest\nPASS: tonikaku2026',
    qr: 'WIFI:S:Tonikaku_Guest;T:WPA;P:tonikaku2026;;',
    footer: '※電波が弱い場合はスタッフまでお申し付けください'
  },
  line: {
    title: '公式LINE友だち募集',
    body: '友だち追加で\n本日使える「ファーストドリンク無料」クーポンプレゼント！',
    qr: 'https://line.me/R/ti/p/@tonikaku_shop',
    footer: '※スタッフにクーポン画面をお見せください'
  },
  review: {
    title: '口コミ投稿のお願い',
    body: 'Googleマップへの口コミ投稿で\n次回使える割引チケット進呈中！',
    qr: 'https://g.page/r/your-shop-review',
    footer: '※皆様の温かいご意見をお待ちしております'
  },
  memo: {
    title: '【連絡】厨房メモ',
    body: '本日のおすすめ:\n・寒ブリの刺身（残5）\n・自家製もつ煮込み',
    qr: '',
    footer: '担当: ホールリーダー'
  }
};

class SoundController {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  // 触感の良い高級感あるチャイム音 (Web Audio API 合成)
  playPrintChime() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // 880Hz -> 1760Hz (明るく心地よい上昇トーン)
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }
}

class App {
  constructor() {
    this.config = this.loadConfig();
    this.sound = new SoundController(this.config.soundEnabled);
    this.currentPreviewXml = '';
    this.currentSelectedTable = TABLES_DATA[0];
    this.animTimer = null;
    this.countdownTimer = null;

    this.initElements();
    this.initEventListeners();
    this.renderTables();
    
    // 初期選択として「T1」をプレビュー表示
    if (this.currentSelectedTable) {
      this.updateStaticPreview(this.currentSelectedTable);
    }
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem('tonikaku_print_cfg');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          paperWidth: parsed.paperWidth || '58',
          printDirection: parsed.printDirection || 'bottom_up',
          showMemo: parsed.showMemo !== undefined ? parsed.showMemo : true
        };
      }
    } catch (e) {
      console.warn('Config load error:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('tonikaku_print_cfg', JSON.stringify(this.config));
    } catch (e) {
      console.warn('Config save error:', e);
    }
    this.sound.enabled = this.config.soundEnabled;
    this.updateHeaderStoreName();
    this.updateConfigChipsUI();
    if (this.currentSelectedTable) {
      this.updateStaticPreview(this.currentSelectedTable);
    }
  }

  updateConfigChipsUI() {
    const container = document.getElementById('active-config-chips');
    if (!container) return;
    const isBottomUp = (this.config.printDirection || 'bottom_up') === 'bottom_up';
    const hasMemo = (this.config.showMemo !== false);

    container.innerHTML = `
      <span class="chip-item" style="background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); color: #34d399; font-size: 11px; padding: 2px 8px; border-radius: 4px;">🖨️ 用紙設定: 58mm (Dinii対応・35桁仕様)</span>
      <span class="chip-item" style="background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.4); color: #60a5fa; font-size: 11px; padding: 2px 8px; border-radius: 4px;">↕️ 印字順: ${isBottomUp ? '下部から(卓番カット側)' : '上部から(標準順序)'}</span>
      <span class="chip-item" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); color: #fbbf24; font-size: 11px; padding: 2px 8px; border-radius: 4px;">✍️ 手書きメモ: ${hasMemo ? '有効' : '非表示'}</span>
      <span class="chip-item" style="background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.4); color: #c084fc; font-size: 11px; padding: 2px 8px; border-radius: 4px;">✨ メリハリ最適化（卓番強調・視認性UP）</span>
    `;
  }

  initElements() {
    // タブ関連
    this.tabs = document.querySelectorAll('.tab-btn');
    this.panes = document.querySelectorAll('.tab-pane');

    // 卓番グリッド
    this.tableGrid = document.getElementById('table-grid');

    // フリー入力フォーム
    this.customTitle = document.getElementById('custom-title');
    this.customBody = document.getElementById('custom-body');
    this.customQr = document.getElementById('custom-qr');
    this.customFooter = document.getElementById('custom-footer');
    this.btnPrintCustom = document.getElementById('btn-print-custom');

    // 静的プレビュー要素
    this.prevStoreName = document.getElementById('prev-store-name');
    this.prevSlipTitle = document.getElementById('prev-slip-title');
    this.prevTableSection = document.getElementById('prev-table-section');
    this.prevTableNo = document.getElementById('prev-table-no');
    this.prevOrderGuide = document.getElementById('prev-order-guide');
    this.prevQrBox = document.getElementById('prev-qr-box');
    this.prevCheckoutSection = document.getElementById('prev-checkout-section');
    this.prevFooter = document.getElementById('prev-footer');
    this.btnPrintPreview = document.getElementById('btn-print-preview');

    // アニメーションオーバーレイ要素
    this.printOverlay = document.getElementById('print-overlay');
    this.animStatusText = document.getElementById('anim-status-text');
    this.animReceipt = document.getElementById('anim-receipt');
    this.animStoreName = document.getElementById('anim-store-name');
    this.animSlipBadge = document.getElementById('anim-slip-badge');
    this.animTableNo = document.getElementById('anim-table-no');
    this.animOrderGuide = document.getElementById('anim-order-guide');
    this.animQrBox = document.getElementById('anim-qr-box');
    this.animCheckoutSection = document.getElementById('anim-checkout-section');
    this.animFooter = document.getElementById('anim-footer');
    this.btnCloseAnim = document.getElementById('btn-close-anim');
    this.animCountdown = document.getElementById('anim-countdown');

    // サウンドトグルボタン
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');
    this.updateSoundButtonUI();

    // 設定モーダル
    this.modalSettings = document.getElementById('settings-modal');
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.btnCloseSettings = document.getElementById('btn-close-settings');
    this.btnSaveSettings = document.getElementById('btn-save-settings');
    this.btnResetSettings = document.getElementById('btn-reset-settings');

    // 設定フォーム
    this.cfgStoreName = document.getElementById('cfg-store-name');
    this.cfgPaperWidth = document.getElementById('cfg-paper-width');
    this.cfgPrintDirection = document.getElementById('cfg-print-direction');
    this.cfgShowMemo = document.getElementById('cfg-show-memo');
    this.cfgQrSize = document.getElementById('cfg-qr-size');

    // 案内メモ欄
    this.prevMemoSection = document.getElementById('prev-memo-section');
    this.animMemoSection = document.getElementById('anim-memo-section');

    // トースト & ヘッダー
    this.toastEl = document.getElementById('toast-notify');
    this.headerStoreName = document.getElementById('header-store-name');

    this.updateHeaderStoreName();
    this.updateConfigChipsUI();
  }

  updateSoundButtonUI() {
    if (this.btnSoundToggle) {
      this.btnSoundToggle.innerText = this.config.soundEnabled ? '🔊' : '🔇';
      this.btnSoundToggle.title = this.config.soundEnabled ? '効果音: ON' : '効果音: OFF';
    }
  }

  updateHeaderStoreName() {
    if (this.headerStoreName) {
      this.headerStoreName.innerText = this.config.storeName || '兎 に 角';
    }
  }

  initEventListeners() {
    // サウンドトグル
    this.btnSoundToggle.addEventListener('click', () => {
      this.config.soundEnabled = !this.config.soundEnabled;
      this.saveConfig({ soundEnabled: this.config.soundEnabled });
      this.updateSoundButtonUI();
      if (this.config.soundEnabled) this.sound.playPrintChime();
      this.showToast(this.config.soundEnabled ? '効果音をONにしました' : '効果音をOFFにしました');
    });

    // タブ切り替え
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(tab.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 定型文チップ
    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tpl = TEMPLATES[chip.dataset.tpl];
        if (!tpl) return;
        this.customTitle.value = tpl.title;
        this.customBody.value = tpl.body;
        this.customQr.value = tpl.qr;
        this.customFooter.value = tpl.footer;
        this.updateStaticPreviewForCustom();
        this.showToast('定型文をセットしました');
      });
    });

    // フリー印字フォーム入力監視
    [this.customTitle, this.customBody, this.customQr, this.customFooter].forEach(input => {
      input.addEventListener('input', () => this.updateStaticPreviewForCustom());
    });

    // フリー印字ボタン
    this.btnPrintCustom.addEventListener('click', () => {
      this.executeCustomPrint();
    });

    // プレビュー画面の印刷ボタン
    this.btnPrintPreview.addEventListener('click', () => {
      if (this.currentSelectedTable) {
        this.triggerPrintWithAnimation(this.currentSelectedTable);
      }
    });

    // アニメーションモーダル閉じる
    this.btnCloseAnim.addEventListener('click', () => {
      this.hidePrintAnimation();
    });

    // 設定モーダル開閉
    this.btnOpenSettings.addEventListener('click', () => this.openSettings());
    this.btnCloseSettings.addEventListener('click', () => this.closeSettings());
    this.modalSettings.addEventListener('click', (e) => {
      if (e.target === this.modalSettings) this.closeSettings();
    });

    // 設定保存
    this.btnSaveSettings.addEventListener('click', () => {
      this.saveConfig({
        storeName: this.cfgStoreName.value.trim() || DEFAULT_CONFIG.storeName,
        paperWidth: this.cfgPaperWidth.value,
        qrSize: parseInt(this.cfgQrSize.value, 10) || 7,
        printDirection: this.cfgPrintDirection ? this.cfgPrintDirection.value : 'bottom_up',
        showMemo: this.cfgShowMemo ? this.cfgShowMemo.value === 'true' : true
      });
      this.closeSettings();
      if (this.currentSelectedTable) {
        this.updateStaticPreview(this.currentSelectedTable);
      }
      this.showToast('設定を保存しました', 'success');
    });

    // 設定初期化
    this.btnResetSettings.addEventListener('click', () => {
      if (confirm('設定を初期値に戻しますか？')) {
        this.saveConfig(DEFAULT_CONFIG);
        this.populateSettingsForm();
        this.showToast('初期値に戻しました');
      }
    });
  }

  // 卓番グリッドの描画
  renderTables() {
    if (!this.tableGrid) return;
    this.tableGrid.innerHTML = '';

    TABLES_DATA.forEach(table => {
      const btn = document.createElement('button');
      btn.className = 'table-btn';
      
      const subLabelHtml = table.subLabel ? `<span class="tbl-sub">${table.subLabel}</span>` : '';
      
      btn.innerHTML = `
        <span class="tbl-num">${table.label}</span>
        ${subLabelHtml}
      `;

      // ★タップで即座に印刷＆数秒アニメーション表示！
      btn.addEventListener('click', () => {
        this.currentSelectedTable = table;
        this.triggerPrintWithAnimation(table);
      });

      this.tableGrid.appendChild(btn);
    });
  }

  // ★即時印刷＆気持ちいいサーマルプリンター演出
  triggerPrintWithAnimation(table) {
    // 1. サウンドフィードバック
    this.sound.playPrintChime();

    // 2. ePOS-Print XMLの生成
    const xml = buildTableQrXml({
      storeName: this.config.storeName,
      tableNo: table.label,
      orderUrl: table.url,
      qrSize: this.config.qrSize,
      paperWidth: this.config.paperWidth,
      printDirection: this.config.printDirection || 'bottom_up',
      showMemo: this.config.showMemo !== false
    });

    // 3. 静的プレビュー更新
    this.updateStaticPreview(table);

    // 4. アニメーションモーダルへ内容反映
    this.animStoreName.innerText = this.config.storeName || '兎 に 角';
    this.animTableNo.innerText = `【  ${table.label}  】`;
    if (this.animMemoSection) {
      this.animMemoSection.style.display = (this.config.showMemo !== false) ? 'block' : 'none';
    }
    this.animFooter.innerHTML = `発行日時: ${new Date().toLocaleString('ja-JP')}`;
    this.animStatusText.innerText = '印字送信中...';
    this.animStatusText.style.color = '#34d399';

    // QR描画
    this.renderQrCode(this.animQrBox, table.url);

    // 5. アニメーションオーバーレイ表示
    this.showPrintAnimation();

    // 6. プリンターURLスキームをトリガー（アニメーション開始直後の180msでキック）
    setTimeout(() => {
      this.sendToEpsonPrinter(xml);
      if (this.animStatusText) {
        this.animStatusText.innerText = '✓ 送信完了';
      }
    }, 180);
  }

  // アニメーションモーダル表示制御（約2.5秒間表示）
  showPrintAnimation() {
    clearTimeout(this.animTimer);
    clearInterval(this.countdownTimer);

    // アニメーションのリセットと開始
    this.animReceipt.style.animation = 'none';
    // リフロー強制
    void this.animReceipt.offsetWidth;
    this.animReceipt.style.animation = '';

    this.printOverlay.classList.add('active');

    let remaining = 2.5;
    this.animCountdown.innerText = remaining.toFixed(1);

    this.countdownTimer = setInterval(() => {
      remaining -= 0.1;
      if (remaining <= 0) {
        clearInterval(this.countdownTimer);
        this.animCountdown.innerText = '0.0';
      } else {
        this.animCountdown.innerText = remaining.toFixed(1);
      }
    }, 100);

    // 2.5秒後に自動的にふわっと閉じる
    this.animTimer = setTimeout(() => {
      this.hidePrintAnimation();
    }, 2500);
  }

  hidePrintAnimation() {
    clearTimeout(this.animTimer);
    clearInterval(this.countdownTimer);
    this.printOverlay.classList.remove('active');
  }

  // フリー印字の実行
  executeCustomPrint() {
    const title = this.customTitle.value.trim();
    const body = this.customBody.value.trim();
    const qr = this.customQr.value.trim();
    const footer = this.customFooter.value.trim();

    if (!title && !body && !qr) {
      alert('印刷する内容（タイトル、本文、QRのいずれか）を入力してください。');
      return;
    }

    this.sound.playPrintChime();

    const xml = buildCustomPrintXml({
      storeName: this.config.storeName,
      title: title,
      bodyText: body,
      qrContent: qr,
      footerText: footer,
      qrSize: this.config.qrSize,
      paperWidth: this.config.paperWidth
    });

    this.updateStaticPreviewForCustom();
    this.sendToEpsonPrinter(xml);
    this.showToast('フリー印字を送信しました！', 'success');
  }

  // TM Print Assistant への送信（URLスキーム）
  sendToEpsonPrinter(xmlData) {
    const encodedXml = encodeURIComponent(xmlData);
    const returnUrl = encodeURIComponent(window.location.href);

    // Epson TM Print Assistant の公式URLスキーム
    // ホスト名は必ず "tmprintassistant.epson.com" を指定（tmprintassistant://print だと host 401 エラーになる）
    const schemeUrl = `tmprintassistant://tmprintassistant.epson.com/print?ver=1&data-type=eposprintxml&error-dialog=yes&data=${encodedXml}&success=${returnUrl}`;

    window.location.href = schemeUrl;
  }

  // 静的プレビュー更新 (卓番用)
  updateStaticPreview(table) {
    this.prevStoreName.innerText = this.config.storeName || '兎 に 角';
    this.prevSlipTitle.innerText = 'モバイルオーダー 兼 お会計票';
    this.prevTableSection.style.display = 'block';
    this.prevTableNo.innerText = `【  ${table.label}  】`;

    if (this.prevMemoSection) {
      this.prevMemoSection.style.display = (this.config.showMemo !== false) ? 'block' : 'none';
    }
    
    this.prevOrderGuide.style.display = 'block';
    this.prevCheckoutSection.style.display = 'block';

    this.prevFooter.innerHTML = `発行日時: ${new Date().toLocaleString('ja-JP')}`;

    this.currentPreviewXml = buildTableQrXml({
      storeName: this.config.storeName,
      tableNo: table.label,
      orderUrl: table.url,
      qrSize: this.config.qrSize,
      paperWidth: this.config.paperWidth,
      printDirection: this.config.printDirection || 'bottom_up',
      showMemo: this.config.showMemo !== false
    });

    this.renderQrCode(this.prevQrBox, table.url);
  }

  // 静的プレビュー更新 (フリー印字用)
  updateStaticPreviewForCustom() {
    const title = this.customTitle.value.trim() || 'サンプルタイトル';
    const body = this.customBody.value.trim() || '本文テキストプレビュー';
    const qr = this.customQr.value.trim();
    const footer = this.customFooter.value.trim() || '※ご不明点はスタッフまで';

    this.prevStoreName.innerText = this.config.storeName || '兎 に 角';
    this.prevSlipTitle.innerText = '';
    this.prevTableSection.style.display = 'none';

    this.prevOrderGuide.style.display = 'block';
    this.prevOrderGuide.innerHTML = `
      <div style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">${title}</div>
      <div style="text-align: left; white-space: pre-wrap; font-size: 12px; color: #333;">${body}</div>
    `;

    this.prevCheckoutSection.style.display = 'none';
    this.prevFooter.innerHTML = `${footer}<br>発行日時: ${new Date().toLocaleString('ja-JP')}`;

    this.currentPreviewXml = buildCustomPrintXml({
      storeName: this.config.storeName,
      title: title,
      bodyText: body,
      qrContent: qr,
      footerText: footer,
      qrSize: this.config.qrSize,
      paperWidth: this.config.paperWidth
    });

    if (qr) {
      this.prevQrBox.style.display = 'flex';
      this.renderQrCode(this.prevQrBox, qr);
    } else {
      this.prevQrBox.style.display = 'none';
    }
  }

  // QRコード描画
  renderQrCode(container, content) {
    if (!container) return;
    container.style.display = 'flex';
    container.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(container, {
          text: content,
          width: 140,
          height: 140,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        return;
      } catch (e) {
        console.warn('QRCode render error:', e);
      }
    }

    container.innerHTML = `<div style="font-size:11px; color:#333;">QRコード</div>`;
  }

  // 設定モーダル
  openSettings() {
    this.populateSettingsForm();
    this.modalSettings.classList.add('open');
  }

  closeSettings() {
    this.modalSettings.classList.remove('open');
  }

  populateSettingsForm() {
    this.cfgStoreName.value = this.config.storeName;
    this.cfgPaperWidth.value = this.config.paperWidth;
    this.cfgQrSize.value = this.config.qrSize;
    if (this.cfgPrintDirection) this.cfgPrintDirection.value = this.config.printDirection || 'bottom_up';
    if (this.cfgShowMemo) this.cfgShowMemo.value = String(this.config.showMemo !== false);
  }

  showToast(message, type = 'normal') {
    if (!this.toastEl) return;
    this.toastEl.innerText = message;
    this.toastEl.className = 'toast show';
    if (type === 'success') this.toastEl.classList.add('success');
    if (type === 'error') this.toastEl.classList.add('error');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.className = 'toast';
    }, 2500);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.tonikakuApp = new App();
  });
} else {
  window.tonikakuApp = new App();
}
