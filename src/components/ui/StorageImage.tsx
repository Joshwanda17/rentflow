import React from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** The source URL - will be auto-signed if it's a Supabase storage URL */
  src?: string | null;
  /** Fallback content to show while loading or if no src */
  fallback?: React.ReactNode;
}

/**
 * Drop-in replacement for <img> that automatically signs Supabase storage URLs.
 * Use this for product images, review images, and any other storage-backed images.
 */
export function StorageImage({ src, fallback, alt, ...props }: StorageImageProps) {
  const signedSrc = useSignedUrl(src);

  if (!signedSrc) {
    if (fallback) return <>{fallback}</>;
    return null;
  }

  return <img src={signedSrc} alt={alt} {...props} />;
}
