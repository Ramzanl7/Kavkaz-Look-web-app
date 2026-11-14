import { useEffect, useState } from 'react';
import { api } from '../api/index.js';

// Мой профиль — один на всё приложение: экран профиля и настройки видят одни и те же данные.
let cache = { uid: null, data: undefined };
const subs = new Set();
const emit = () => subs.forEach((f) => f(cache.data));

export async function reloadProfile(uid) {
  if (!uid) { cache = { uid: null, data: null }; emit(); return null; }
  const data = await api.getMyProfile(uid);
  cache = { uid, data }; emit();
  return data;
}
export function patchProfile(p) { if (cache.data) { cache = { ...cache, data: { ...cache.data, ...p } }; emit(); } }

export function useMyProfile(uid) {
  const [data, setData] = useState(cache.uid === uid ? cache.data : undefined);
  useEffect(() => {
    subs.add(setData);
    if (cache.uid !== uid || cache.data === undefined) reloadProfile(uid); else setData(cache.data);
    return () => { subs.delete(setData); };
  }, [uid]);
  return data;
}
