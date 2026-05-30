import { Fragment, type ReactNode } from 'react';

/**
 * Minimum markdown renderer — bağımlılık eklemeden notlar için.
 *
 * Desteklenen:
 *  - **bold** ve __bold__
 *  - *italic* ve _italic_
 *  - `inline code`
 *  - [text](url) linkler (yeni sekmede açılır, target="_blank")
 *  - Satır başında "# " H3, "## " H4 başlık
 *  - Satır başında "- " veya "* " ile liste maddesi
 *  - Boş satır = paragraf ayırma
 *
 * Güvenlik: tüm metin önce text node olarak render edilir; HTML enjeksiyonu yok.
 */

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Link önce — sonra bold/italic/code overlap etmesin
  const tokenRe = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const url = sanitizeUrl(match[3]);
      nodes.push(
        url ? (
          <a key={key++} href={url} target="_blank" rel="noreferrer noopener" className="text-accent underline hover:text-accent/80">
            {match[2]}
          </a>
        ) : (
          <span key={key++}>{match[2]}</span>
        ),
      );
    } else if (match[4]) {
      nodes.push(<strong key={key++} className="font-semibold text-slate-100">{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<strong key={key++} className="font-semibold text-slate-100">{match[7]}</strong>);
    } else if (match[8]) {
      nodes.push(<em key={key++} className="italic text-slate-200">{match[9]}</em>);
    } else if (match[10]) {
      nodes.push(<em key={key++} className="italic text-slate-200">{match[11]}</em>);
    } else if (match[12]) {
      nodes.push(<code key={key++} className="rounded bg-bg-card px-1 text-[0.9em] text-accent">{match[13]}</code>);
    }
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^\//.test(trimmed)) return trimmed; // internal route
  return null;
}

interface MarkdownProps {
  text: string;
  className?: string;
}

export function MiniMarkdown({ text, className }: MarkdownProps) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!listBuffer.length) return;
    blocks.push(
      <ul key={`l${key++}`} className="ml-4 list-disc space-y-0.5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const joined = paragraphBuffer.join(' ');
    blocks.push(
      <p key={`p${key++}`}>
        {renderInline(joined)}
      </p>,
    );
    paragraphBuffer = [];
  };

  for (const raw of lines) {
    const ln = raw.trimEnd();
    if (!ln.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const h3 = /^#\s+(.+)/.exec(ln);
    const h4 = /^##\s+(.+)/.exec(ln);
    const li = /^[-*]\s+(.+)/.exec(ln);
    if (h4) {
      flushParagraph();
      flushList();
      blocks.push(<h4 key={`h${key++}`} className="text-sm font-semibold text-slate-100">{renderInline(h4[1])}</h4>);
    } else if (h3) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={`h${key++}`} className="text-base font-bold text-slate-100">{renderInline(h3[1])}</h3>);
    } else if (li) {
      flushParagraph();
      listBuffer.push(li[1]);
    } else {
      flushList();
      paragraphBuffer.push(ln);
    }
  }
  flushParagraph();
  flushList();

  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
