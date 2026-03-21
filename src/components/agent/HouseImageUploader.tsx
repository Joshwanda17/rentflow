import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { optimizeImage, generateThumbnail } from '@/lib/imageOptimizer';

interface HouseImageFile {
  id: string;
  previewUrl: string;
  file: File;
  thumbnailFile?: File;
}

interface HouseImageUploaderProps {
  images: HouseImageFile[];
  onChange: (images: HouseImageFile[]) => void;
  maxImages?: number;
}

export type { HouseImageFile };

export function HouseImageUploader({ images, onChange, maxImages = 5 }: HouseImageUploaderProps) {
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = maxImages - images.length;
    if (files.length > remaining) {
      toast.error(`You can only add ${remaining} more photo(s)`);
      return;
    }

    setCompressing(true);
    const newImages: HouseImageFile[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB`);
        continue;
      }

      try {
        const optimized = await optimizeImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
        const thumb = await generateThumbnail(file, 300);
        
        const saved = Math.round((1 - optimized.compressedSize / optimized.originalSize) * 100);
        if (saved > 10) {
          console.log(`[ImageOptimizer] ${file.name}: ${(optimized.originalSize/1024).toFixed(0)}KB → ${(optimized.compressedSize/1024).toFixed(0)}KB (${saved}% smaller)`);
        }

        newImages.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          previewUrl: optimized.previewUrl,
          file: optimized.file,
          thumbnailFile: thumb.file,
        });
      } catch (err) {
        console.error('Image optimization failed, using original:', err);
        newImages.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          previewUrl: URL.createObjectURL(file),
          file,
        });
      }
    }

    setCompressing(false);
    onChange([...images, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const remove = (id: string) => {
    const img = images.find(i => i.id === id);
    if (img) URL.revokeObjectURL(img.previewUrl);
    onChange(images.filter(i => i.id !== id));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Photos ({images.length}/{maxImages})</Label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleSelect}
        className="hidden"
      />

      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {images.map(img => (
            <div key={img.id} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border">
              <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(img.id)}
                className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < maxImages && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed min-h-[44px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
        >
          {compressing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              {images.length === 0 ? 'Add Photos' : 'Add More'}
            </>
          )}
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        Photos help tenants find your listing · max 5MB each
      </p>
    </div>
  );
}

/** Upload images to storage and return public URLs. Images are already optimized client-side. */
export async function uploadHouseImages(
  userId: string,
  listingId: string,
  files: File[],
  thumbnailFiles?: (File | undefined)[]
): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop() || 'webp';
    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `${userId}/${listingId}/${baseName}.${ext}`;

    const { error } = await supabase.storage
      .from('house-images')
      .upload(path, file, { cacheControl: '86400', upsert: false });

    if (error) {
      console.error('Upload error:', error);
      continue;
    }

    // Upload thumbnail alongside
    const thumbFile = thumbnailFiles?.[i];
    if (thumbFile) {
      const thumbExt = thumbFile.name.split('.').pop() || 'webp';
      const thumbPath = `${userId}/${listingId}/thumb_${baseName}.${thumbExt}`;
      await supabase.storage
        .from('house-images')
        .upload(thumbPath, thumbFile, { cacheControl: '86400', upsert: false })
        .catch(e => console.warn('Thumbnail upload failed:', e));
    }

    const { data } = supabase.storage.from('house-images').getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}
