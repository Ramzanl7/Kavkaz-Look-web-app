// Линейные иконки, толщина линии 1,6 px
export const PATHS = {
  pen: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  home: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  catalog: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  flame: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.6 3.6-9.3 2.3 1.4 3.6 3.6 3.9 5.6 1-.7 1.7-1.9 1.9-3.2 2 1.7 3.6 4.2 3.6 6.9 0 3.6-2.6 6.2-6.5 6.2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  close: 'M6 6l12 12M18 6L6 18',
  hand: 'M3 12l4-4 4 2 3-3 3 1 4 4-5 5-3-1-2 2-4-2zM11 10l3 3M14 13l2 2',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  sparkles: 'M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9zM18 2l.7 1.6L20.3 4.3l-1.6.7L18 6.6l-.7-1.6-1.6-.7 1.6-.7z',
  down: 'M6 9l6 6 6-6',
  cart: 'M3 4h2.5l2.2 10.5h10.6L20.5 7H6.5M9.5 19.5a1.2 1.2 0 1 0 0-.1M17 19.5a1.2 1.2 0 1 0 0-.1',
  shop: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  bag: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  box: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  ruler: 'M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2',
  chat: 'M4 5h16v11H9l-5 4z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  store: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  send: 'M21 3L3 11l7 3 3 7zM10 14l11-11',
};
export const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);
export const starsText = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
