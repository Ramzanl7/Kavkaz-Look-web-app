import { useState } from 'react';
// Фото грузится лениво, пока идёт загрузка — мерцающая заглушка. Если превью нет, берётся основное фото.
export default function PhotoSlot({ src, fallback, alt = '', ratio = '4 / 3', priority = false }) {
  const [s, setS] = useState(src);
  const [ok, setOk] = useState(false);
  return (
    <figure className={'photo' + (ok || !src ? '' : ' skeleton')} style={{ aspectRatio: ratio }}>
      {s ? (
        <img src={s} alt={alt} className={ok ? 'loaded' : ''} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setOk(true)} onError={() => { if (fallback && s !== fallback) setS(fallback); else setOk(true); }} />
      ) : <div className="photo-empty" aria-hidden="true" />}
    </figure>
  );
}
