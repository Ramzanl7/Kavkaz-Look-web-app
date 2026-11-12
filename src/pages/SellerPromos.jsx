import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import PromoManager from '../components/PromoManager.jsx';
import { api } from '../api/index.js';

export default function SellerPromos() {
  const { user } = useAuth();
  const [b, setB] = useState(undefined);
  useEffect(() => { if (user) api.getMyBoutique(user.id).then(setB); }, [user]);
  return (
    <main className="wrap">
      <h1 className="screen-title rise">Промокоды бутика</h1>
      {b === undefined ? <p className="lead">Загрузка…</p> : b ? <PromoManager boutiqueId={b.id} /> : <p className="lead">Бутик не найден.</p>}
    </main>
  );
}
