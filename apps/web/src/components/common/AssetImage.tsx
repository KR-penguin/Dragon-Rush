import { useState } from 'react';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface AssetImageProps {
  /** Path relative to public/assets/. */
  path: string;
  fallback: string;
  alt: string;
  className?: string;
}

/** Shows the art file when it exists, otherwise the emoji fallback (never requests a missing file). */
export function AssetImage({ path, fallback, alt, className = '' }: AssetImageProps) {
  const url = useAssetUrl(path);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        className={`asset asset-img ${className}`}
        src={url}
        alt={alt}
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`asset asset-emoji ${className}`} role="img" aria-label={alt}>
      {fallback}
    </span>
  );
}
