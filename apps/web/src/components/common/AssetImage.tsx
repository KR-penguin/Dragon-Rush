import { useState, type ReactNode } from 'react';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface AssetImageProps {
  /** Path relative to public/assets/. */
  path: string;
  /** Drawn when the art file does not exist (an SVG icon, or text). */
  fallback: ReactNode;
  alt: string;
  className?: string;
}

/** Shows the art file when it exists, otherwise the fallback (never requests a missing file). */
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
    <span className={`asset asset-icon ${className}`} role="img" aria-label={alt}>
      {fallback}
    </span>
  );
}
