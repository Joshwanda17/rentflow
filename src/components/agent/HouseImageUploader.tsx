import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, X, Loader2, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HouseImageFile {
  id: string;
  previewUrl: string;
  file: File;
}

interface HouseImageUploaderProps {
  images: HouseImageFile[];
  onChange: (images: HouseImageFile[]) => void;
  maxImages?: number;
}

export type { HouseImageFile };

export function HouseImageUploader({ images, onChange, maxImages = 5 }: HouseImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = maxImages - images.length;
    if (files.length > remaining) {
      toast.error(`You can only add ${remaining} more photo(s)`);
      return;
    }

    const newImages: HouseImageFile[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 5MB`);
        continue;
      }
      newImages.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    }

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
        >
          <Camera className="h-4 w-4 mr-2" />
          {images.length === 0 ? 'Add Photos' : 'Add More'}
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        Photos help tenants find your listing · max 5MB each
      </p>
    </div>
  );
}

/** Upload images to storage and return public URLs */
export async function uploadHouseImages(
  userId: string,
  listingId: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = [];

  for (const file of files) {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/${listingId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

    const { error } = await supabase.storage
      .from('house-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Upload error:', error);
      continue;
    }

    const { data } = supabase.storage.from('house-images').getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}
