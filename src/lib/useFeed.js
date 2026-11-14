import { useCallback, useEffect, useRef, useState } from 'react';
import { api, PAGE } from '../api/index.js';

// Лента товаров: первая страница сразу (из кэша, если есть), следующие — при прокрутке до конца.
export function useFeed(opts, delay = 0) {
  const [items, setItems] = useState(() => api.peekList({ ...opts, boutiqueId: '' }));
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [error, setError] = useState(false);
  const loading = useRef(false), req = useRef(0);
  const key = JSON.stringify(opts);
  useEffect(() => {
    const id = ++req.current;
    setItems(api.peekList({ ...opts, boutiqueId: '' }) ?? null); setPage(0); setMore(true); setError(false);
    loading.current = true;
    const t = setTimeout(() => api.listProducts({ ...opts, page: 0 }).then((r) => {
      if (id !== req.current) return;
      loading.current = false;
      if (r === null) { setError(true); setItems((v) => v ?? []); return; }
      setItems(r); setMore(r.length === PAGE);
    }), delay);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = useCallback(() => {
    if (loading.current || !more || !items) return;
    loading.current = true;
    const id = req.current, next = page + 1;
    api.listProducts({ ...opts, page: next }).then((r) => {
      if (id !== req.current) return;
      loading.current = false;
      const list = r || [];
      setItems((v) => { const have = new Set(v.map((p) => p.id)); return [...v, ...list.filter((p) => !have.has(p.id))]; });
      setPage(next); setMore(list.length === PAGE);
    });
  }, [items, more, page, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);
  return { items, more, error, sentinel };
}
