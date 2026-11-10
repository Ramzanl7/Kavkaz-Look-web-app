export default function Ornament({ height = 24 }) {
  return (
    <svg className="belt" width="100%" height={height} aria-hidden="true">
      <defs><pattern id="orn" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M12 8 L16 12 L12 16 L8 12 Z" fill="currentColor" opacity=".55" />
      </pattern></defs>
      <rect width="100%" height={height} fill="url(#orn)" />
    </svg>
  );
}
