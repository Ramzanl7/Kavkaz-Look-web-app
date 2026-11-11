import { useEffect, useState } from 'react';

// 3D-просмотр товара и «Посмотреть в AR» (iPhone — Quick Look, Android — Scene Viewer).
// Библиотека model-viewer (Google, Apache-2.0) грузится только здесь, когда покупатель открыл 3D.
export default function Viewer3D({ src, alt }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    import('@google/model-viewer').then(() => on && setReady(true)).catch(() => on && setFailed(true));
    return () => { on = false; };
  }, []);
  if (failed) return <p className="notice">Не удалось загрузить 3D-просмотр.</p>;
  if (!ready) return <div className="viewer3d skeleton" />;
  return (
    <model-viewer
      className="viewer3d"
      src={src}
      alt={alt}
      ar=""
      ar-modes="webxr scene-viewer quick-look"
      camera-controls=""
      touch-action="pan-y"
      auto-rotate=""
      shadow-intensity="1"
      exposure="1.05"
      interaction-prompt="auto"
    >
      <button slot="ar-button" type="button" className="ar-btn">Посмотреть у себя (AR)</button>
    </model-viewer>
  );
}
