import { useState } from 'react';
import { FIT_PREFS } from '../lib/fit.js';

// Короткий опросник: как покупатель любит носить одежду. По ответам подбираем размер и пишем,
// где вещь свободнее или плотнее, чем ему нравится. Все вопросы необязательны.
const QUESTIONS = [
  { key: 'fit', title: 'Как вы любите носить одежду?', opts: Object.entries(FIT_PREFS).map(([v, p]) => [v, p.label, p.hint]) },
  { key: 'between', title: 'Если вы между двумя размерами, что взять?', opts: [['smaller', 'Меньший', 'чтобы сидело аккуратнее'], ['bigger', 'Больший', 'чтобы точно не жало']] },
  { key: 'length', only: 'female', title: 'Какую длину платьев и юбок вы любите?', opts: [['maxi', 'Макси', 'до щиколотки или в пол'], ['midi', 'Миди', 'ниже колена'], ['any', 'Не важно', '']] },
  { key: 'trousers', only: 'male', title: 'Какую длину брюк вы любите?', opts: [['long', 'Длинные', 'до обуви'], ['cropped', 'Укороченные', 'открывают щиколотку'], ['any', 'Не важно', '']] },
];

export default function FitQuiz({ initial, onSave, onSkip, busy, gender = 'female', compact = false }) {
  const [a, setA] = useState(() => ({ ...(initial || {}) }));
  return (
    <section className="fit-quiz" aria-label="Опросник о посадке">
      {!compact && <h2>Подберём размер под ваш вкус</h2>}
      {!compact && <p className="hint" style={{ margin: 0 }}>Три коротких вопроса — ответы сохранятся в «Моих мерках», их можно изменить в любой момент.</p>}
      {QUESTIONS.filter((q) => !q.only || q.only === (gender === 'male' ? 'male' : 'female')).map((q) => (
        <fieldset key={q.key}>
          <legend>{q.title}</legend>
          <div className="quiz-opts" role="radiogroup" aria-label={q.title}>
            {q.opts.map(([v, label, hint]) => (
              <button key={v} type="button" role="radio" aria-checked={a[q.key] === v} className={'quiz-opt press' + (a[q.key] === v ? ' on' : '')}
                onClick={() => setA({ ...a, [q.key]: a[q.key] === v ? undefined : v })}>
                <span>{label}</span>{hint && <small>{hint}</small>}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="quiz-actions">
        <button type="button" className="btn btn-primary press" disabled={busy} onClick={() => onSave(a)}>{busy ? 'Сохраняем…' : 'Сохранить ответы'}</button>
        {onSkip && <button type="button" className="link-u" onClick={onSkip}>Пропустить</button>}
      </div>
    </section>
  );
}
