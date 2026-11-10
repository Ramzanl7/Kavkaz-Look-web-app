export default function Stub({ title, hint }) {
  return (
    <main className="screen">
      <h1>{title}</h1>
      <p className="muted">{hint || 'Экран в разработке.'}</p>
    </main>
  );
}
