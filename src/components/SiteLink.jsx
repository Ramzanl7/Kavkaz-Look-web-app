/* global __ADMIN_APP__ */
import { Link } from 'react-router-dom';
import { SITE_URL } from '../lib/sites.js';

// Ссылка на страницу приложения: в приложении — обычный переход, в отдельной админке — открыть сайт в новой вкладке
export default function SiteLink({ to, ...props }) {
  if (typeof __ADMIN_APP__ !== 'undefined' && __ADMIN_APP__) return <a href={SITE_URL + to} target="_blank" rel="noopener noreferrer" {...props} />;
  return <Link to={to} {...props} />;
}
