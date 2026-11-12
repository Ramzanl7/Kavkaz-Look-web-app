import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';

const REASONS = [['fake', 'Подделка или обман в описании'], ['prohibited', 'Запрещённый товар'], ['offensive', 'Оскорбления или неприличное'], ['fraud', 'Мошенничество'], ['other', 'Другое']];

// Жалоба на товар, отзыв или бутик — уходит в очередь администратора
export default function ReportSheet({ type, id, onClose }) {
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [busy, run] = useAction();
  const toast = useToast();
  const send = () => run(async () => {
    const err = await api.report(type, id, reason, text);
    if (err) { toast(err); return; }
    toast('Жалоба отправлена. Спасибо!'); onClose();
  });
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rep-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="rep-t">Пожаловаться</h2>
        <div className="city-list">
          {REASONS.map(([v, l]) => <button key={v} type="button" className={'city-opt press' + (reason === v ? ' on' : '')} onClick={() => setReason(v)}>{l}</button>)}
        </div>
        <div className="field"><label htmlFor="rp">Подробнее (необязательно)</label><textarea id="rp" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <button type="button" className="btn btn-primary press" disabled={!reason || !!busy} onClick={send}>{busy ? 'Отправляем…' : 'Отправить'}</button>
        <button type="button" className="btn btn-secondary press" onClick={onClose}>Отмена</button>
      </div>
    </div>,
    document.body,
  );
}
