import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAction } from '../lib/useAction.js';
import { useToast } from '../store/toast.jsx';
import { rub } from '../store/cart.jsx';

// Админка рекламы на главной: местные бренды («Сделано рядом») и оплаченные размещения товаров («Популярное сейчас»).
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const live = (s, e) => { const n = Date.now(); return new Date(s).getTime() <= n && (!e || new Date(e).getTime() > n); };
const EMPTY_BRAND = { name: '', description: '', site_url: '', ios_url: '', android_url: '', boutique_id: '', starts_at: day(new Date()), ends_at: '', is_approved: false, sort: 0 };
const EMPTY_PROMO = { product_id: '', advertiser: '', advertiser_inn: '', erid: '', starts_at: day(new Date()), ends_at: '', sort: 0 };

export default function AdminPromo() {
  const toast = useToast();
  const [busy, run] = useAction();
  const [brands, setBrands] = useState(null);
  const [promos, setPromos] = useState(null);
  const [boutiques, setBoutiques] = useState([]);
  const [b, setB] = useState(null), [files, setFiles] = useState({});
  const [pr, setPr] = useState(null), [found, setFound] = useState([]), [q, setQ] = useState('');
  const load = () => { api.adminListBrands().then(setBrands); api.adminListPromotions().then(setPromos); };
  useEffect(() => { load(); api.listBoutiques().then(setBoutiques); }, []);
  useEffect(() => { if (pr) api.adminFindProducts(q).then(setFound); }, [q, !!pr]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveBrand = () => run(async () => {
    const err = await api.adminSaveBrand(b, files);
    if (err) { toast(err); return; }
    toast('Бренд сохранён'); setB(null); setFiles({}); load();
  }, 'brand');
  const savePromo = () => run(async () => {
    const err = await api.adminSavePromotion(pr);
    if (err) { toast(err); return; }
    toast('Размещение сохранено'); setPr(null); load();
  }, 'promo');
  const field = (obj, set, k, label, props = {}) => (
    <div className="field"><label htmlFor={'f-' + k}>{label}</label><input id={'f-' + k} value={obj[k] ?? ''} onChange={(e) => set({ ...obj, [k]: e.target.value })} {...props} /></div>
  );

  return (
    <main className="wrap">
      <h1 className="screen-title rise">Реклама на главной</h1>

      <div className="sec-head"><h2>Сделано рядом — бренды</h2><button type="button" className="link-u" onClick={() => { setB(EMPTY_BRAND); setFiles({}); }}>Добавить</button></div>
      <p className="hint">Показываются только одобренные бренды в сроке показа. Ссылки проверьте до публикации — только https.</p>
      {brands === null ? <div className="skeleton" style={{ height: 80, borderRadius: 16 }} /> : brands.length ? brands.map((x) => (
        <div key={x.id} className="bcard promo-row">
          {x.banner ? <img src={x.banner} alt="" /> : <span className="promo-thumb" />}
          <div className="grow"><strong>{x.name}</strong><small className="muted block">{x.is_approved ? (live(x.starts_at, x.ends_at) ? 'Показывается' : 'Вне срока показа') : 'Не одобрен'} · {day(x.starts_at)} — {x.ends_at ? day(x.ends_at) : 'без срока'}</small></div>
          <div className="acts">
            <button type="button" className="act press" onClick={() => { setB({ ...x, starts_at: day(x.starts_at), ends_at: day(x.ends_at), boutique_id: x.boutique_id || '' }); setFiles({}); }}>Изменить</button>
            <button type="button" className="act danger press" disabled={!!busy} onClick={() => run(async () => { if (!window.confirm('Удалить бренд «' + x.name + '»?')) return; if (await api.adminDeleteBrand(x.id)) load(); else toast('Не удалось удалить'); }, 'del')}>Удалить</button>
          </div>
        </div>
      )) : <p className="muted">Брендов пока нет.</p>}

      <div className="sec-head"><h2>Популярное сейчас — реклама товаров</h2><button type="button" className="link-u" onClick={() => { setPr(EMPTY_PROMO); setQ(''); }}>Добавить</button></div>
      <p className="hint">Продвижение не меняет цену. На карточке — пометка «Реклама» с рекламодателем и токеном erid (по закону о рекламе токен выдаёт оператор рекламных данных). Снятый с продажи товар из выдачи пропадает сам.</p>
      {promos === null ? <div className="skeleton" style={{ height: 80, borderRadius: 16 }} /> : promos.length ? promos.map((x) => (
        <div key={x.id} className="bcard promo-row">
          <div className="grow"><strong>{x.product?.title || 'Товар удалён'}</strong>
            <small className="muted block">{x.advertiser}{x.erid ? ' · erid ' + x.erid : ' · без erid'} · {live(x.starts_at, x.ends_at) && x.product?.is_published ? 'Показывается' : 'Не показывается'} · до {day(x.ends_at)}</small></div>
          <div className="acts">
            <button type="button" className="act press" onClick={() => { setPr({ ...x, starts_at: day(x.starts_at), ends_at: day(x.ends_at), advertiser_inn: x.advertiser_inn || '', erid: x.erid || '' }); setQ(''); }}>Изменить</button>
            <button type="button" className="act danger press" disabled={!!busy} onClick={() => run(async () => { if (!window.confirm('Снять размещение?')) return; if (await api.adminDeletePromotion(x.id)) load(); else toast('Не удалось'); }, 'del')}>Снять</button>
          </div>
        </div>
      )) : <p className="muted">Размещений пока нет — в ленте показываются самые популярные товары без рекламы.</p>}

      {b && (
        <div className="sheet-bg" onClick={() => setB(null)}>
          <div className="sheet form" role="dialog" aria-modal="true" aria-labelledby="ab-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="ab-t">{b.id ? 'Бренд' : 'Новый бренд'}</h2>
            {field(b, setB, 'name', 'Название', { maxLength: 60 })}
            {field(b, setB, 'description', 'Описание (1–2 строки)', { maxLength: 140 })}
            <div className="field"><label htmlFor="f-banner">Баннер (широкое фото)</label><input id="f-banner" type="file" accept="image/*" onChange={(e) => setFiles({ ...files, banner: e.target.files[0] })} /></div>
            <div className="field"><label htmlFor="f-logo">Логотип (необязательно)</label><input id="f-logo" type="file" accept="image/*" onChange={(e) => setFiles({ ...files, logo: e.target.files[0] })} /></div>
            <div className="field"><label htmlFor="f-bq">Своя страница в Kavkaz Look (бутик)</label>
              <select id="f-bq" value={b.boutique_id} onChange={(e) => setB({ ...b, boutique_id: e.target.value })}><option value="">Нет</option>{boutiques.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            {field(b, setB, 'site_url', 'Сайт', { placeholder: 'https://', inputMode: 'url' })}
            {field(b, setB, 'ios_url', 'Приложение в App Store (или универсальная ссылка)', { placeholder: 'https://apps.apple.com/…', inputMode: 'url' })}
            {field(b, setB, 'android_url', 'Приложение в Google Play (или App Link)', { placeholder: 'https://play.google.com/…', inputMode: 'url' })}
            <div className="row">{field(b, setB, 'starts_at', 'Начало показа', { type: 'date' })}{field(b, setB, 'ends_at', 'Окончание', { type: 'date' })}</div>
            {field(b, setB, 'sort', 'Порядок (меньше — раньше)', { inputMode: 'numeric', maxLength: 3 })}
            <label className="check"><input type="checkbox" checked={b.is_approved} onChange={(e) => setB({ ...b, is_approved: e.target.checked })} /> Проверен модерацией, показывать</label>
            <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={saveBrand}>{busy === 'brand' ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      )}
      {pr && (
        <div className="sheet-bg" onClick={() => setPr(null)}>
          <div className="sheet form" role="dialog" aria-modal="true" aria-labelledby="ap-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="ap-t">Размещение товара</h2>
            <div className="field"><label htmlFor="f-q">Товар</label><input id="f-q" placeholder="Поиск по названию" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="pick-list">{found.map((x) => (
              <button key={x.id} type="button" className={'drop-item' + (pr.product_id === x.id ? ' on' : '')} onClick={() => setPr({ ...pr, product_id: x.id })}>
                <span className="grow">{x.title} <small className="muted">· {x.boutique?.name}</small></span><b>{rub(x.price_rub)}</b>
              </button>
            ))}</div>
            {field(pr, setPr, 'advertiser', 'Рекламодатель (бутик или ИП)', { maxLength: 120 })}
            {field(pr, setPr, 'advertiser_inn', 'ИНН рекламодателя', { inputMode: 'numeric', maxLength: 12 })}
            {field(pr, setPr, 'erid', 'Токен erid от оператора рекламных данных', { maxLength: 40 })}
            <div className="row">{field(pr, setPr, 'starts_at', 'Начало', { type: 'date' })}{field(pr, setPr, 'ends_at', 'Окончание', { type: 'date' })}</div>
            {field(pr, setPr, 'sort', 'Порядок', { inputMode: 'numeric', maxLength: 3 })}
            <button type="button" className="btn btn-primary press" disabled={!!busy} onClick={savePromo}>{busy === 'promo' ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      )}
    </main>
  );
}
