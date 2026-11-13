import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import PhoneInput, { formatPhone } from '../components/PhoneInput.jsx';

// Оплата и приём заказов бутика: способы оплаты при доставке, номер для СБП, автоприём
export default function SellerPayments() {
  const { user } = useAuth();
  const [b, setB] = useState(undefined), [pay, setPay] = useState(undefined), [msg, setMsg] = useState('');
  const [busy, run] = useAction(); const toast = useToast();
  useEffect(() => {
    if (!user) return;
    api.getMyBoutique(user.id).then(async (r) => {
      setB(r);
      const p = r ? await api.myBoutiquePay(r.id) : null;
      setPay(p ? { ...p, sbp_phone: p.sbp_phone ? formatPhone(p.sbp_phone) : '', sbp_bank: p.sbp_bank || '' } : null);
    });
  }, [user]);
  const save = (e) => { e.preventDefault(); return run(async () => {
    setMsg('');
    const err = await api.saveBoutiquePay(b.id, pay);
    if (err) setMsg(err); else toast('Настройки сохранены');
  }); };
  if (b === undefined || pay === undefined) return <main className="wrap"><p className="lead">Загрузка…</p></main>;
  if (!b) return <main className="wrap"><p className="lead">Бутик не найден.</p></main>;
  if (!pay) return <main className="wrap"><h1 className="screen-title">Оплата и приём заказов</h1><p className="notice">Настройки заработают после обновления базы. Напишите администратору.</p></main>;
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Оплата и приём заказов</h1>
      <form className="form" onSubmit={save}>
        <fieldset className="size-editor">
          <legend>Приём заказов</legend>
          <label className="check"><input type="checkbox" checked={pay.auto_accept} onChange={(e) => setPay({ ...pay, auto_accept: e.target.checked })} /> <span><b>Принимать заказы автоматически</b> — вам придёт уведомление, нажимать ничего не нужно. Заказ закроется сам через 3 дня или когда покупатель подтвердит получение.</span></label>
        </fieldset>
        <fieldset className="size-editor">
          <legend>Оплата при доставке курьером</legend>
          <label className="check"><input type="checkbox" checked={pay.pay_cash} onChange={(e) => setPay({ ...pay, pay_cash: e.target.checked })} /> Наличными при получении</label>
          <label className="check"><input type="checkbox" checked={pay.pay_transfer} onChange={(e) => setPay({ ...pay, pay_transfer: e.target.checked })} /> Переводом при получении</label>
          <label className="check"><input type="checkbox" checked={pay.pay_prepay} onChange={(e) => setPay({ ...pay, pay_prepay: e.target.checked })} /> Предоплата по СБП — покупатель переводит до отправки</label>
          {pay.pay_prepay && <>
            <div className="field"><label htmlFor="sp">Номер для перевода по СБП</label><PhoneInput id="sp" value={pay.sbp_phone} onChange={(sbp_phone) => setPay((x) => ({ ...x, sbp_phone }))} /></div>
            <div className="field"><label htmlFor="sb">Банк</label><input id="sb" maxLength={40} value={pay.sbp_bank} onChange={(e) => setPay({ ...pay, sbp_bank: e.target.value })} placeholder="Например, Сбербанк" /></div>
            <p className="hint">Номер увидит только покупатель, выбравший предоплату, — в своём заказе.</p>
          </>}
          <p className="hint">Самовывоз и примерка — оплата в бутике. Если покупатель не оплатит доставку, нажмите в заказе «Не оплатил»: ему закроют новые заказы, а администрация свяжется с ним.</p>
        </fieldset>
        {msg && <p className="msg" role="status">{msg}</p>}
        <button className="btn btn-primary press" type="submit" disabled={!!busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
      </form>
    </main>
  );
}
