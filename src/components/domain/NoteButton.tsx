import { useState } from 'react';
import { StickyNote } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { notesRepo } from '@/data/repositories';

interface NoteButtonProps {
  symbol?: string;
  newsId?: string;
  hint?: string;
  size?: number;
}

export function NoteButton({ symbol, newsId, hint, size = 13 }: NoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await notesRepo.add({ body, symbol, newsId });
      setBody('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-bg-card hover:text-slate-200"
        title="Not ekle"
      >
        <StickyNote size={size} />
        <span className="hidden sm:inline">Not</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Not ekle${symbol ? ` — ${symbol}` : ''}`}
        size="sm"
      >
        <Field label="Not içeriği" hint={hint}>
          <textarea
            className="input min-h-[120px]"
            placeholder="Bu hisse / haber hakkında düşüncen…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            İptal
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !body.trim()}>
            Kaydet
          </button>
        </div>
      </Modal>
    </>
  );
}
