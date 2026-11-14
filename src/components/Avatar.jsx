// Аватарка: фото пользователя или первая буква имени на золотом фоне
export default function Avatar({ src, name, size = 88, className = '' }) {
  const letter = (String(name || '').trim()[0] || 'K').toUpperCase();
  return (
    <span className={'avatar ' + className} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : letter}
    </span>
  );
}
