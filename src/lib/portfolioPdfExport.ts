/**
 * Portföy PDF Export — jsPDF ile client-side PDF üretir.
 *
 * PortfolioPage'de "PDF İndir" butonuna bağlanır.
 * Rapor içeriği:
 *   - Başlık + InvestliQ brand + tarih + kullanıcı email
 *   - Toplam değer / maliyet / kâr-zarar / günlük değişim özet kartı
 *   - Pozisyon tablosu (sembol/lot/maliyet/fiyat/değer/P&L/P&L%)
 *   - Alt bilgi: SPK yatırım tavsiyesi değildir uyarısı
 */
import jsPDF from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';

export interface PortfolioPdfRow {
  symbol: string;
  name?: string;
  lot: number;
  avgPrice: number;
  currentPrice?: number;
  marketValue?: number;
  cost: number;
  pnl?: number;
  pnlPct?: number;
}

export interface PortfolioPdfTotals {
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  dailyChange: number;
  dailyPnlPct: number;
}

export interface PortfolioPdfOptions {
  title?: string;
  tabLabel?: string;
  userEmail?: string;
  rows: PortfolioPdfRow[];
  totals: PortfolioPdfTotals;
}

const TR = (v: number, decimals = 2): string =>
  v.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const MONEY = (v: number): string => `${TR(v, 2)} TL`;

const PCT = (v: number): string => {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${TR(v, 2)}%`;
};

export function generatePortfolioPdf(opts: PortfolioPdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // --- HEADER ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('InvestliQ', margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Yatirim Verisi Platformu', margin + 32, y);

  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(dateStr, pageWidth - margin, y, { align: 'right' });
  y += 10;

  // --- TITLE ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  const title = opts.title || `Portfoy Raporu${opts.tabLabel ? ` — ${opts.tabLabel}` : ''}`;
  doc.text(title, margin, y);
  y += 6;

  if (opts.userEmail) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Kullanici: ${opts.userEmail}`, margin, y);
    y += 5;
  }

  // --- ÖZET KART ---
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 30, 2, 2, 'FD');

  const boxY = y + 5;
  const col1X = margin + 5;
  const col2X = margin + (pageWidth - 2 * margin) / 4 + 5;
  const col3X = margin + 2 * (pageWidth - 2 * margin) / 4 + 5;
  const col4X = margin + 3 * (pageWidth - 2 * margin) / 4 + 5;

  const summaryCell = (label: string, value: string, x: number, valueColor?: [number, number, number]) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), x, boxY);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (valueColor) doc.setTextColor(...valueColor);
    else doc.setTextColor(30, 30, 30);
    doc.text(value, x, boxY + 6);
  };

  const pnlColor: [number, number, number] = opts.totals.totalPnl >= 0 ? [34, 139, 34] : [200, 40, 40];
  const dayColor: [number, number, number] = opts.totals.dailyChange >= 0 ? [34, 139, 34] : [200, 40, 40];

  summaryCell('Toplam Deger', MONEY(opts.totals.totalValue), col1X);
  summaryCell('Toplam Maliyet', MONEY(opts.totals.totalCost), col2X);
  summaryCell(
    'Kar / Zarar',
    `${MONEY(opts.totals.totalPnl)}  ${PCT(opts.totals.totalPnlPct)}`,
    col3X,
    pnlColor,
  );
  summaryCell(
    'Gunluk Degisim',
    `${MONEY(opts.totals.dailyChange)}  ${PCT(opts.totals.dailyPnlPct)}`,
    col4X,
    dayColor,
  );

  y += 35;

  // --- POZİSYON TABLOSU ---
  const tableBody = opts.rows.map((r) => [
    r.symbol,
    r.name ?? '—',
    TR(r.lot, r.lot % 1 !== 0 ? 4 : 0),
    MONEY(r.avgPrice),
    r.currentPrice != null ? MONEY(r.currentPrice) : '—',
    MONEY(r.cost),
    r.marketValue != null ? MONEY(r.marketValue) : '—',
    r.pnl != null ? MONEY(r.pnl) : '—',
    r.pnlPct != null ? PCT(r.pnlPct) : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Sembol', 'Ad', 'Lot', 'Ort. Maliyet', 'Guncel', 'Maliyet', 'Deger', 'K/Z', 'K/Z %']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: [40, 100, 180], fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // K/Z sütununda renk
      if ((data.column.index === 7 || data.column.index === 8) && data.section === 'body') {
        const raw = data.cell.text.join('');
        if (raw.startsWith('+')) data.cell.styles.textColor = [34, 139, 34];
        else if (raw.startsWith('-')) data.cell.styles.textColor = [200, 40, 40];
      }
    },
    margin: { left: margin, right: margin },
  } as UserOptions);

  // --- FOOTER ---
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 100;
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = Math.max(finalY + 15, pageHeight - 25);

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 140, 140);
  const disclaimer =
    'Bu rapor sadece bilgi amaclidir. SPK anlaminda yatirim danismanligi olarak degerlendirilemez. ' +
    'Yatirim kararlarinizi kendi arastirmaniz sonucunda alin.';
  const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - 2 * margin);
  doc.text(splitDisclaimer, margin, footerY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('investliq.com', pageWidth - margin, pageHeight - 8, { align: 'right' });

  return doc;
}

export function downloadPortfolioPdf(opts: PortfolioPdfOptions): void {
  const doc = generatePortfolioPdf(opts);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const suffix = opts.tabLabel ? `_${opts.tabLabel.toLowerCase()}` : '';
  doc.save(`investliq_portfoy${suffix}_${stamp}.pdf`);
}
