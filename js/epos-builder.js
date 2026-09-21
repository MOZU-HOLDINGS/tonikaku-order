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
 * @returns {string} ePOS-Print XML文字列
 */
export function buildTableQrXml({
  storeName = '兎 に 角',
  tableNo = 'T1',
  orderUrl = '',
  qrSize = 7,
  paperWidth = '80'
}) {
  const is58mm = paperWidth === '58';
  const doubleSep = is58mm
    ? '========================\n'
    : '================================\n';
  const singleSep = is58mm 
    ? '------------------------\n'
    : '--------------------------------\n';

  return `<?xml version="1.0" encoding="utf-8"?>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
  <!-- 日本語言語設定（日本語・漢字・記号を正常印字するために必須） -->
  <text lang="ja"/>
  <text align="center"/>

  <!-- ヘッダー: 店舗名 & 伝票種別 -->
  <text font="font_a" width="1" height="1">${doubleSep}</text>
  <text font="font_a" width="2" height="2" em="true">${escapeXml(storeName)}\n</text>
  <text font="font_a" width="1" height="1">【 モバイルオーダー 兼 お会計票 】\n</text>
  <text font="font_a" width="1" height="1">${doubleSep}\n</text>

  <!-- テーブル番号（スタッフ・レジ・お客様から一番見えやすい特大サイズ） -->
  <text font="font_a" width="1" height="1">テーブル番号\n</text>
  <text font="font_a" width="2" height="2" em="true">【  ${escapeXml(tableNo)}  】\n\n</text>
  <text font="font_a" width="1" height="1">${singleSep}</text>

  <!-- ご注文案内（不自然な文字分断を防ぎ、美しく中央配置される3行構成） -->
  <text font="font_a" width="1" height="1" em="true">◆ ご 注 文 ◆\n</text>
  <text font="font_a" width="1" height="1">スマートフォンで下の\nQRコードを読み取り\n各自でご注文をお願いいたします\n\n</text>

  <!-- QRコード印字 (Model 2, Error Correction Level M) -->
  <symbol type="qrcode_model_2" level="level_m" width="${Math.max(4, Math.min(10, qrSize))}">${escapeXml(orderUrl)}</symbol>
  <feed unit="20"/>

  <!-- お会計案内（レジ持参スタイル） -->
  <text font="font_a" width="1" height="1">${singleSep}</text>
  <text font="font_a" width="1" height="1" em="true">◆ お 会 計 ◆\n</text>
  <text font="font_a" width="1" height="1" em="true">【この伝票をレジへお持ちください】\n\n</text>
  <text font="font_a" width="1" height="1">${doubleSep}</text>

  <!-- 発行日時 & カット -->
  <text font="font_b" width="1" height="1">発行日時: ${getFormattedDate()}\n</text>
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
  const doubleSep = is58mm ? '========================\n' : '================================\n';
  const singleSep = is58mm ? '------------------------\n' : '--------------------------------\n';

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
  ${title ? `<text font="font_a" width="2" height="2" em="true">${escapeXml(title)}\n\n</text>` : ''}

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
