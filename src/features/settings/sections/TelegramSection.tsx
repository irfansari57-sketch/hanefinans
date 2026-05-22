import { useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { getTelegramChatId, setTelegramChatId, sendTelegram } from '@/lib/telegram';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

/**
 * Kullanıcı-bazlı Telegram chat_id girişi + test mesajı.
 * Fiyat alarmları ve AI analiz bildirimleri için.
 */
export function TelegramSection() {
  const [chatId, setChatIdState] = useState<string>(() => getTelegramChatId() ?? '');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const save = () => {
    setTelegramChatId(chatId.trim() || null);
    toast.success('Telegram chat_id kaydedildi');
  };

  const test = async () => {
    if (!chatId.trim()) {
      setResult({ ok: false, msg: 'Önce chat_id girip kaydet' });
      return;
    }
    setTelegramChatId(chatId.trim());
    setTesting(true);
    setResult(null);
    const r = await sendTelegram(
      `🎯 <b>Hane Finans test</b>\nBildirimler çalışıyor!\n<i>${new Date().toLocaleString('tr-TR')}</i>`,
    );
    setResult({ ok: r.ok, msg: r.ok ? "Test mesajı Telegram'a gönderildi! ✓" : (r.error ?? 'Bilinmeyen hata') });
    setTesting(false);
  };

  return (
    <div className="rounded-xl border border-border bg-bg-soft p-4 lg:col-span-2">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Bell size={14} className="text-accent" /> Telegram Bildirimleri
      </h2>
      <p className="text-xs leading-relaxed text-slate-400">
        Fiyat alarmı tetiklendiğinde, AI analizi hazır olduğunda Telegram'a bildirim al.
        Önce Telegram'da <code className="rounded bg-bg-card px-1 text-accent">@HaneFinansBot</code> botuyla
        sohbet başlat, sonra <code className="rounded bg-bg-card px-1 text-accent">@userinfobot</code>'tan
        kendi <strong>chat_id</strong>'ni al ve buraya yapıştır.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          inputMode="numeric"
          placeholder="örn: 123456789"
          value={chatId}
          onChange={(e) => setChatIdState(e.target.value)}
          className="input"
        />
        <button onClick={save} className="btn-secondary">Kaydet</button>
        <button onClick={test} disabled={testing} className="btn-primary">
          {testing ? 'Gönderiliyor…' : 'Test mesajı'}
        </button>
      </div>

      {result && (
        <div
          className={cn(
            'mt-2 rounded-md border px-3 py-2 text-xs',
            result.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          {result.ok ? <Check size={12} className="inline mr-1" /> : <X size={12} className="inline mr-1" />}
          {result.msg}
        </div>
      )}
    </div>
  );
}
