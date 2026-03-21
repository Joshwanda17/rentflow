import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, X, Loader2, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HouseImageFile {
  id: string;
  previewUrl: string;
  file: File;
}

interface HouseVideoFile {
  id: string;
  previewUrl: string;
  file: File;
}

interface HouseImageUploaderProps {
  images: HouseImageFile[];
  onChange: (images: HouseImageFile[]) => void;
  maxImages?: number;
  video?: HouseVideoFile | null;
  onVideoChange?: (video: HouseVideoFile | null) => void;
}

export type { HouseImageFile, HouseVideoFile };

export function HouseImageUploader({ images, onChange, maxImages = 5, video, onVideoChange }: HouseImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video must be under 50MB. Try a shorter clip!');
      return;
    }

    // Revoke old preview
    if (video) URL.revokeObjectURL(video.previewUrl);

    onVideoChange?.({
      id: `vid-${Date.now()}`,
      previewUrl: URL.createObjectURL(file),
      file,
    });
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const remove = (id: string) => {
    const img = images.find(i => i.id === id);
    if (img) URL.revokeObjectURL(img.previewUrl);
    onChange(images.filter(i => i.id !== id));
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.previewUrl);
    onVideoChange?.(null);
  };

  return (
    <div className="space-y-3">
      {/* Photos */}
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

      {/* Video */}
      {onVideoChange && (
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5 text-primary" />
            Video Tour (optional)
          </Label>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleVideoSelect}
            className="hidden"
          />

          {video ? (
            <div className="relative rounded-xl overflow-hidden border border-primary/30 bg-muted">
              <video
                src={video.previewUrl}
                className="w-full h-32 object-cover"
                muted
                playsInline
              />
              <button
                type="button"
                onClick={removeVideo}
                className="absolute top-1.5 right-1.5 bg-destructive text-destructive-foreground rounded-full p-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="absolute bottom-1.5 left-1.5 bg-primary/80 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                🎬 Video ready
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed min-h-[44px] border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => videoInputRef.current?.click()}
            >
              <Video className="h-4 w-4 mr-2" />
              Add Short Video Tour
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">
            15-30 sec walkthrough · max 50MB · helps tenants decide faster
          </p>
        </div>
      )}
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

/** Upload a video to storage and return public URL */
export async function uploadHouseVideo(
  userId: string,
  listingId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${userId}/${listingId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('house-videos')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) {
    console.error('Video upload error:', error);
    return null;
  }

  const { data } = supabase.storage.from('house-videos').getPublicUrl(path);
  return data.publicUrl;
}

