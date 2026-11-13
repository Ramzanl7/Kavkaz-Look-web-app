import { Component } from 'react';

// Если экран не смог загрузиться (обновилась версия, оборвалась связь) — один раз перезагружаемся сами,
// а если не помогло — показываем «Обновить», а не пустой экран.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(String(error?.message || error));
    let tried = false;
    try { tried = sessionStorage.getItem('kl-chunk-reload') === '1'; } catch { /* приватный режим */ }
    if (chunk && !tried) {
      try { sessionStorage.setItem('kl-chunk-reload', '1'); } catch { /* приватный режим */ }
      window.location.reload();
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="wrap" role="alert">
        <h1 className="screen-title">Не удалось открыть экран</h1>
        <p className="lead">Скорее всего, прервалась связь или вышло обновление приложения.</p>
        <button type="button" className="btn btn-primary press" onClick={() => { try { sessionStorage.removeItem('kl-chunk-reload'); } catch { /* */ } window.location.reload(); }}>Обновить</button>
      </main>
    );
  }
}
