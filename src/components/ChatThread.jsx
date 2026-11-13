import { useEffect, useRef } from 'react';

const time = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Лента сообщений поддержки. me — чьи сообщения справа: 'user' (у пользователя) или 'admin' (в админке).
export default function ChatThread({ messages, me, orderLabel, onOrder }) {
  const end = useRef(null);
  const count = messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count]);
  return (
    <div className="chat" role="log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={'bubble' + (m.author === me ? ' mine' : '')}>
          {m.author !== me && <span className="bubble-who">{m.author === 'admin' ? 'Поддержка Kavkaz Look' : 'Пользователь'}</span>}
          <p>{m.body}</p>
          {m.order_id && (onOrder
            ? <button type="button" className="bubble-order press" onClick={() => onOrder(m.order_id)}>Заказ {orderLabel(m.order_id)}</button>
            : <span className="bubble-order">Заказ {orderLabel(m.order_id)}</span>)}
          <time>{time(m.created_at)}</time>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
