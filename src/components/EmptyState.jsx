export default function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}
