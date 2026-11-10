// Всё, что вводит пользователь, проходит очистку перед отправкой на сервер.
export const cleanQuery = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Знаки подстановки LIKE экранируются, чтобы ввод не превращался в шаблон.
export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
