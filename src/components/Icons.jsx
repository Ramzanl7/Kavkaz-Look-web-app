// Линейные иконки, толщина линии 1,6 px
export const PATHS = {
  catalog: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  shop: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  bag: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  back: 'M15 5l-7 7 7 7',
};
export const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);
export const starsText = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
