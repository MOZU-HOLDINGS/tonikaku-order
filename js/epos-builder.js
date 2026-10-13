/**
 * epos-builder.js
 * EPSON TM-m30Ⅱ 向け ePOS-Print XML 生成モジュール
 * 
 * 仕様:
 * - 「モバイルオーダー 兼 お会計票」専用レイアウト
 * - テーブル番号（T1〜T25, 予2, 予備等）を最優先で強調
 * - 注文: スマホで各自注文
 * - 会計: 伝票をレジへ持参するスタイル
 * - QR下のURL印字なし、不要な注釈なしのスッキリしたデザイン
 * - ブザー命令は kitchen の静穏・Dinii業務妨害防止のため一切含めません
 * - QRコード: モデル2, 誤り訂正M (標準)
 * - カット: フィード後パーシャルカット
 */

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * モバイルオーダー 兼 お会計票の ePOS-Print XML を生成
 * 
 * @param {Object} params
 * @param {string} params.storeName 店舗名（デフォルト: "兎 に 角"）
 * @param {string} params.tableNo 卓番（例: "T1", "T20", "予2"）
 * @param {string} params.orderUrl DiniiのモバイルオーダーGateway URL
 * @param {number} [params.qrSize=7] QRモジュールサイズ
 * @param {string} [params.paperWidth="80"] 用紙幅 ("80" または "58")
 * @param {string} [params.printDirection="bottom_up"] 印字方向 ("bottom_up": 下部から印字・卓番カット側 / "top_down": 上部から)
 * @param {boolean} [params.showMemo=true] 手書き案内メモ欄（担当・人数・時間・プラン・おと・F・他）の有無
 * @returns {string} ePOS-Print XML文字列
 */
/**
 * 全幅の黒背景白文字バナー文字列（左右スペースパディング付き）を生成
 */
function createReverseBanner(text, targetCols = 40) {
  let displayWidth = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // 全角文字・漢字・記号等は2列
    displayWidth += (code > 0x7f) ? 2 : 1;
  }
  const pad = Math.max(0, targetCols - displayWidth);
  const leftPad = Math.floor(pad / 2);
  const rightPad = pad - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * モバイルオーダー 兼 お会計票の ePOS-Print XML を生成
 * 
 * @param {Object} params
 * @param {string} params.storeName 店舗名（デフォルト: "兎 に 角"）
 * @param {string} params.tableNo 卓番（例: "T1", "T20", "予2"）
 * @param {string} params.orderUrl DiniiのモバイルオーダーGateway URL
 * @param {number} [params.qrSize=5] QRモジュールサイズ
 * @param {string} [params.paperWidth="80"] 用紙幅 ("80" または "58")
 * @param {string} [params.printDirection="bottom_up"] 印字方向 ("bottom_up": 下部から印字・卓番カット側 / "top_down": 上部から)
 * @param {boolean} [params.showMemo=true] 手書き案内メモ欄（担当・人数・時間・プラン・おと・F・他）の有無
 * @returns {string} ePOS-Print XML文字列
 */
export function buildTableQrXml({
  storeName = '兎 に 角',
  tableNo = 'T1',
  orderUrl = '',
  qrSize = 5,
  paperWidth = '80',
  printDirection = 'bottom_up',
  showMemo = true
}) {
  const is58mm = paperWidth === '58';
  // 80mm時は40文字（480dot）、58mm時は30文字（360dot）
  // 40文字にすることで、72mm/80mmのどのプリンター余白モードでも絶対に改行されません
  const targetCols = is58mm ? 30 : 40;
  const sep = is58mm
    ? '------------------------------\n'
    : '----------------------------------------\n';

  // --- セクション定義 (上下方向を極力コンパクトに凝縮) ---

  // 1. ヘッダー（店舗名＆白抜き黒帯タイトル）
  const titleBanner = createReverseBanner(
    is58mm ? '■ モバイルオーダー兼会計票 ■' : '■ モバイルオーダー 兼 お会計票 ■',
    targetCols
  );

  const headerBlock = `
    <!-- 店舗名 & タイトル -->
    <text font="font_a" width="2" height="2" em="true">${escapeXml(storeName)}\n</text>
    <feed unit="4"/>
    <text font="font_a" width="1" height="1" em="true" reverse="true">${titleBanner}\n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
  `;

  // 2. テーブル番号（コンパクトかつ遠くからでも見やすい太字倍角）
  const tableBlock = `
    <!-- テーブル番号 -->
    <feed unit="6"/>
    <text font="font_a" width="2" height="2" em="true">卓番: 【 ${escapeXml(tableNo)} 】\n</text>
  `;

  // 3. 手書き案内メモ欄（スタッフ記入用: 担当・人数・時間・おと・F・他）
  const memoBlock = showMemo ? `
    <!-- 手書きメモ欄 -->
    <text font="font_a" width="1" height="1">${sep}</text>
    <text font="font_a" width="1" height="1" align="left">
${is58mm
  ? ' 担当:____  ___名  ___H / ___\n'
  : ' 担当: _______   _____名   _____H / _____ \n'
}</text>
    <feed unit="8"/>
    <text font="font_a" width="1" height="1" align="left">
${is58mm
  ? ' おと:____  ___F   他:_______\n'
  : ' おと: _______   _____F    他: __________ \n'
}</text>
    <text align="center"/>
    <text font="font_a" width="1" height="1">${sep}</text>
  ` : '';

  // 4. モバイルオーダー（ご 注 文）＆ QRコード（コンパクト）
  const orderBanner = createReverseBanner(
    is58mm ? '◆ ご注文（モバイル）◆' : '◆ ご注文（モバイルオーダー）◆',
    targetCols
  );

  const effectiveQrSize = Math.max(4, Math.min(6, qrSize || 5));

  const orderBlock = `
    <!-- モバイルオーダー（ご 注 文） -->
    <feed unit="6"/>
    <text font="font_a" width="1" height="1" em="true" reverse="true">${orderBanner}\n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <feed unit="4"/>
    <text font="font_a" width="1" height="1">スマホでQR読取 → ご注文ください\n</text>
    <feed unit="6"/>
    <!-- QRコード印字 (Model 2, Error Correction Level M) -->
    <symbol type="qrcode_model_2" level="level_m" width="${effectiveQrSize}">${escapeXml(orderUrl)}</symbol>
    <feed unit="6"/>
  `;

  // 5. お会計票（レジ持参案内）
  const checkoutBanner = createReverseBanner(
    is58mm ? '◆ お 会 計 票 ◆' : '◆ お 会 計 票 ◆',
    targetCols
  );

  const checkoutBlock = `
    <!-- お会計案内 -->
    <text font="font_a" width="1" height="1">${sep}</text>
    <text font="font_a" width="1" height="1" em="true" reverse="true">${checkoutBanner}\n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <feed unit="4"/>
    <text font="font_a" width="1" height="1" em="true">【 この伝票をレジへお持ちください 】\n</text>
    <text font="font_a" width="1" height="1">${sep}</text>
  `;

  // 6. 発行日時
  const footerBlock = `
    <!-- 発行日時 -->
    <text font="font_b" width="1" height="1">発行: ${getFormattedDate()}\n</text>
  `;

  // --- 印字順序の制御 ---
  // 'bottom_up' (下部からの印刷・卓番カット側):
  //   用紙排出順: [発行日時] → [お会計票] → [QR/注文] → [手書きメモ] → [卓番] → [店舗名] → [カット]
  //   カットされた伝票を手にとると、最上部に卓番と店舗名が来て、最も見やすくなります。
  // 'top_down' (通常):
  //   用紙排出順: [店舗名] → [卓番] → [手書きメモ] → [QR/注文] → [お会計票] → [発行日時] → [カット]
  let contentXml = '';
  if (printDirection === 'bottom_up') {
    contentXml = `
      ${footerBlock}
      ${checkoutBlock}
      ${orderBlock}
      ${memoBlock}
      ${tableBlock}
      ${headerBlock}
    `;
  } else {
    contentXml = `
      ${headerBlock}
      ${tableBlock}
      ${memoBlock}
      ${orderBlock}
      ${checkoutBlock}
      ${footerBlock}
    `;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
  <!-- 用紙幅設定: 80mm=800 / 58mm=580 （プリンターへ80mm幅を強制指定） -->
  <layout type="receipt" width="${is58mm ? '580' : '800'}"/>
  <!-- 日本語言語設定（日本語・漢字・記号を正常印字するために必須） -->
  <text lang="ja"/>
  <text align="center"/>
  ${contentXml}
  <feed unit="8"/>
  <cut type="feed"/>
</epos-print>`.trim();
}

/**
 * 任意のテキストやQRを印刷できる「フリー印字」の ePOS-Print XML を生成
 */
export function buildCustomPrintXml({
  storeName = '兎 に 角',
  title = '',
  bodyText = '',
  qrContent = '',
  footerText = '',
  qrSize = 7,
  paperWidth = '80'
}) {
  const is58mm = paperWidth === '58';
  const doubleSep = is58mm ? '================================\n' : '============================================\n';
  const singleSep = is58mm ? '--------------------------------\n' : '--------------------------------------------\n';

  let qrXml = '';
  if (qrContent && qrContent.trim().length > 0) {
    qrXml = `
      <symbol type="qrcode_model_2" level="level_m" width="${Math.max(4, Math.min(10, qrSize))}">${escapeXml(qrContent.trim())}</symbol>
      <feed unit="16"/>
    `;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
  <!-- 用紙幅設定: 80mm=800 / 58mm=580 -->
  <layout type="receipt" width="${is58mm ? '580' : '800'}"/>
  <!-- 日本語言語設定 -->
  <text lang="ja"/>
  <text align="center"/>
  ${storeName ? `
  <text font="font_a" width="1" height="1">${doubleSep}</text>
  <text font="font_a" width="2" height="2" em="true">${escapeXml(storeName)}\n</text>
  <text font="font_a" width="1" height="1">${doubleSep}\n</text>
  ` : ''}

  <!-- タイトル -->
  ${title ? `
  <text font="font_a" width="1" height="1" em="true" reverse="true">  ${escapeXml(title)}  \n</text>
  <text font="font_a" width="1" height="1" reverse="false"/>
  <feed unit="8"/>
  ` : ''}

  <!-- 本文 (左揃え) -->
  ${bodyText ? `
  <text align="left" font="font_a" width="1" height="1"/>
  <text>${escapeXml(bodyText)}\n\n</text>
  <text align="center"/>
  ` : ''}

  <!-- QRコード（存在する場合） -->
  ${qrXml}

  <text font="font_a" width="1" height="1">${singleSep}</text>
  ${footerText ? `<text font="font_b" width="1" height="1">${escapeXml(footerText)}\n</text>` : ''}
  <text font="font_b" width="1" height="1">発行: ${getFormattedDate()}\n</text>
  <text font="font_a" width="1" height="1">${doubleSep}</text>

  <!-- 送り & カット -->
  <feed unit="8"/>
  <cut type="feed"/>
</epos-print>`.trim();
}

/**
 * 現在日時フォーマット (YYYY/MM/DD HH:mm)
 */
function getFormattedDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${min}`;
}
