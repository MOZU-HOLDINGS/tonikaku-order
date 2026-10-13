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
export function buildTableQrXml({
  storeName = '兎 に 角',
  tableNo = 'T1',
  orderUrl = '',
  qrSize = 7,
  paperWidth = '80',
  printDirection = 'bottom_up',
  showMemo = true
}) {
  const is58mm = paperWidth === '58';
  // 80mm時は44文字（約528dot）で用紙幅いっぱいにフィット。58mm時は32文字（384dot）
  const doubleSep = is58mm
    ? '================================\n'
    : '============================================\n';
  const singleSep = is58mm 
    ? '--------------------------------\n'
    : '--------------------------------------------\n';

  // --- セクション定義 ---

  // 1. ヘッダー（店舗名＆白抜き黒帯タイトル）
  const headerBlock = `
    <!-- 店舗名 & タイトル -->
    <text font="font_a" width="1" height="1">${doubleSep}</text>
    <text font="font_a" width="2" height="2" em="true">${escapeXml(storeName)}\n</text>
    <feed unit="8"/>
    <text font="font_a" width="1" height="1" em="true" reverse="true">  モバイルオーダー 兼 お会計票  \n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <text font="font_a" width="1" height="1">${doubleSep}\n</text>
  `;

  // 2. テーブル番号（遠くからでも一目で分かる特大太字）
  const tableBlock = `
    <!-- テーブル番号 -->
    <text font="font_a" width="1" height="1">テーブル番号\n</text>
    <text font="font_a" width="3" height="3" em="true">【  ${escapeXml(tableNo)}  】\n\n</text>
  `;

  // 3. 手書き案内メモ欄（担当・人数・時間・おと・F・他）
  const memoBlock = showMemo ? `
    <!-- 手書き案内プラン欄（スタッフ記入用） -->
    <text font="font_a" width="1" height="1">${singleSep}</text>
    <text font="font_a" width="1" height="1" em="true">【 ご案内プラン（手書きメモ）】\n</text>
    <feed unit="8"/>
    <text font="font_a" width="1" height="1" align="left">
${is58mm
  ? ' 担当: _____    _____ 名\n _____ H / _____\n おと _____    _____ F   他 _____\n'
  : ' 担当: _______    ______ 名    ______ H / ______\n おと _______     ______ F     他 ______________\n'
}</text>
    <text align="center"/>
    <feed unit="8"/>
    <text font="font_a" width="1" height="1">${singleSep}\n</text>
  ` : '';

  // 4. モバイルオーダー（ご 注 文）＆ QRコード（白抜き黒帯バナーで明瞭化）
  const orderBlock = `
    <!-- モバイルオーダー（ご 注 文） -->
    <text font="font_a" width="1" height="1" em="true" reverse="true">   ◆ ご 注 文（モバイルオーダー）◆   \n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <feed unit="12"/>
    <text font="font_a" width="1" height="1">スマートフォンで下の\nQRコードを読み取り\n各自でご注文をお願いいたします\n\n</text>

    <!-- QRコード印字 (Model 2, Error Correction Level M) -->
    <symbol type="qrcode_model_2" level="level_m" width="${Math.max(4, Math.min(10, qrSize))}">${escapeXml(orderUrl)}</symbol>
    <feed unit="20"/>
  `;

  // 5. お会計票（レジ持参案内・白抜き特大強調）
  const checkoutBlock = `
    <!-- お会計案内（レジ持参スタイル） -->
    <text font="font_a" width="1" height="1">${singleSep}</text>
    <text font="font_a" width="1" height="1" em="true" reverse="true">   ◆ お 会 計 票 ◆   \n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <feed unit="12"/>
    <text font="font_a" width="1" height="2" em="true" reverse="true"> 【この伝票をレジへお持ちください】 \n</text>
    <text font="font_a" width="1" height="1" reverse="false"/>
    <feed unit="8"/>
    <text font="font_a" width="1" height="1">※お会計の際、本票をレジカウンターへご提示ください\n</text>
    <text font="font_a" width="1" height="1">${doubleSep}</text>
  `;

  // 6. 発行日時
  const footerBlock = `
    <!-- 発行日時 -->
    <text font="font_b" width="1" height="1">発行日時: ${getFormattedDate()}\n</text>
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
  <!-- 日本語言語設定（日本語・漢字・記号を正常印字するために必須） -->
  <text lang="ja"/>
  <text align="center"/>
  ${contentXml}
  <feed unit="30"/>
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
  <text font="font_b" width="1" height="1">発行日時: ${getFormattedDate()}\n</text>
  <text font="font_a" width="1" height="1">${doubleSep}</text>

  <!-- 送り & カット -->
  <feed unit="30"/>
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
