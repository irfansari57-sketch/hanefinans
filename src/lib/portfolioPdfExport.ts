/**
 * Portföy PDF Export — jspdf + jspdf-autotable ile tek sayfa özet raporu.
 *
 * PortfolioPage.tsx → "PDF İndir" butonu bu helper'i çağırır.
 * Türkçe karakter destegi: jspdf'in varsayilan Helvetica fontu Latin-1
 * genisletmesiyle Turkce karakterleri destekler. Ozel font gerekmez.
 *
 * Yerlesim:
 *   - Header: InvestliQ logo satiri + baslik + tarih
 *   - Ozet kutulari: Toplam Deger / Maliyet / K/Z / Bugun
 *   - Detay tablo: Sembol / Lot / Ort.Maliyet / Fiyat / Deger / K/Z
 *   - Footer: kullanici email + disclaimer + sayfa no
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfRow {
  symbol: string;
  name?: string;
  lot: number;
  avgPrice: number;
  currentPrice?: number;
  marketValue?: number;
  cost?: number;
  pnl?: number;
  pnlPct?: number;
}

export interface PdfTotals {
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  dailyChange: number;
  dailyPnlPct: number;
  validCount: number;
}

export interface PdfExportArgs {
  tabLabel: string; // 'Hisseler' veya 'Fonlar'
  userEmail?: string;
  rows: PdfRow[];
  totals: PdfTotals;
}

function fmtTL(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function fmtPct(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** FT Salmon palet — pdf ozeti icin */
const PALETTE = {
  bordo: [153, 15, 61] as [number, number, number],
  cream: [255, 241, 229] as [number, number, number],
  success: [15, 118, 110] as [number, number, number], // teal-700
  danger: [190, 18, 60] as [number, number, number], // rose-700
  text: [15, 23, 42] as [number, number, number], // slate-900
  muted: [100, 116, 139] as [number, number, number], // slate-500
  border: [226, 232, 240] as [number, number, number], // slate-200
};

export function downloadPortfolioPdf(args: PdfExportArgs): void {
  const { tabLabel, userEmail, rows, totals } = args;
  const now = new Date();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // ==================== HEADER ====================
  doc.setFillColor(...PALETTE.cream);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...PALETTE.bordo);
  doc.rect(0, 26, pageWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...PALETTE.bordo);
  doc.text('InvestliQ', margin, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PALETTE.muted);
  doc.text('Yatirimcilar Icin Akilli Veri Platformu', margin, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.text);
  const titleText = `Portfoy Raporu - ${tabLabel}`;
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, pageWidth - margin - titleWidth, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PALETTE.muted);
  const dateText = fmtDateTime(now);
  const dateWidth = doc.getTextWidth(dateText);
  doc.text(dateText, pageWidth - margin - dateWidth, 20);

  // ==================== OZET KUTULARI ====================
  const summaryY = 36;
  const boxH = 20;
  const boxGap = 3;
  const boxW = (pageWidth - margin * 2 - boxGap * 3) / 4;

  const summaryBoxes: Array<{ label: string; value: string; sub?: string; tone?: 'success' | 'danger' | 'accent' | 'default' }> = [
    { label: 'Toplam Deger', value: fmtTL(totals.totalValue), tone: 'accent' },
    { label: 'Toplam Maliyet', value: fmtTL(totals.totalCost), tone: 'default' },
    {
      label: 'Toplam Kar/Zarar',
      value: (totals.totalPnl >= 0 ? '+' : '') + fmtTL(totals.totalPnl),
      sub: fmtPct(totals.totalPnlPct),
      tone: totals.totalPnl >= 0 ? 'success' : 'danger',
    },
    {
      label: 'Bugunku Degisim',
      value: (totals.dailyChange >= 0 ? '+' : '') + fmtTL(totals.dailyChange),
      sub: fmtPct(totals.dailyPnlPct),
      tone: totals.dailyChange >= 0 ? 'success' : 'danger',
    },
  ];

  summaryBoxes.forEach((box, i) => {
    const x = margin + i * (boxW + boxGap);
    const toneColor =
      box.tone === 'success' ? PALETTE.success :
      box.tone === 'danger' ? PALETTE.danger :
      box.tone === 'accent' ? PALETTE.bordo :
      PALETTE.text;

    doc.setDrawColor(...PALETTE.border);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, summaryY, boxW, boxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PALETTE.muted);
    doc.text(box.label.toUpperCase(), x + 2.5, summaryY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...toneColor);
    doc.text(box.value, x + 2.5, summaryY + 12);

    if (box.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(box.sub, x + 2.5, summaryY + 17);
    }
  });

  // ==================== DETAY TABLO ====================
  const tableY = summaryY + boxH + 6;

  const tableRows = rows.map((r) => [
    r.symbol,
    r.name ?? '-',
    r.lot.toLocaleString('tr-TR', { maximumFractionDigits: 4 }),
    r.avgPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    r.currentPrice != null ? r.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    r.cost != null ? fmtTL(r.cost) : '-',
    r.marketValue != null ? fmtTL(r.marketValue) : '-',
    r.pnl != null ? `${r.pnl >= 0 ? '+' : ''}${fmtTL(r.pnl)}` : '-',
    r.pnlPct != null ? fmtPct(r.pnlPct) : '-',
  ]);

  autoTable(doc, {
    startY: tableY,
    head: [['Sembol', 'Ad', 'Lot', 'Ort. Mal.', 'Fiyat', 'Maliyet', 'Deger', 'K/Z', '%']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: PALETTE.bordo,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: PALETTE.text,
      cellPadding: 1.5,
    },
    alternateRowStyles: { fillColor: PALETTE.cream },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', cellWidth: 18 },
      1: { halign: 'left', cellWidth: 32 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    // Kar/zarar sutunlarina tone rengi ver
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = rows[data.row.index];
      if (!row) return;
      if ((data.column.index === 7 || data.column.index === 8) && row.pnl != null) {
        data.cell.styles.textColor = row.pnl >= 0 ? PALETTE.success : PALETTE.danger;
      }
    },
  });

  // ==================== FOOTER ====================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PALETTE.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PALETTE.muted);

    const leftFooter = userEmail
      ? `${userEmail} | investliq.com`
      : 'investliq.com';
    doc.text(leftFooter, margin, pageHeight - 9);

    doc.text(
      'Bu rapor bilgilendirme amaclidir, yatirim tavsiyesi degildir. SPK mevzuati kapsaminda hazirlanmamistir.',
      margin,
      pageHeight - 5,
    );

    const pageText = `Sayfa ${i} / ${pageCount}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    doc.text(pageText, pageWidth - margin - pageTextWidth, pageHeight - 9);
  }

  // ==================== KAYIT ====================
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const filename = `investliq-portfoy-${tabLabel.toLowerCase()}-${yyyy}${mm}${dd}-${hh}${mi}.pdf`;
  doc.save(filename);
}
