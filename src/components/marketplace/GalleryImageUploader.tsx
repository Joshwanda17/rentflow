import { useState, useRef } from 'react';
import { StorageImage } from '@/components/ui/StorageImage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { optimizeImage } from '@/lib/imageOptimizer';

interface GalleryImage {
  id: string;
  image_url: string;
  display_order: number;
  isNew?: boolean;
  file?: File;
}

interface GalleryImageUploaderProps {
  productId?: string;
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  maxImages?: number;
}

export function GalleryImageUploader({ 
  productId, 
  images, 
  onChange, 
  maxImages = 5 
}: GalleryImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = maxImages - images.length;
    if (files.length > remainingSlots) {
      toast.error(`You can only add ${remainingSlots} more image(s)`);
      return;
    }

    setUploading(true);
    const newImages: GalleryImage[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }

      try {
        const optimized = await optimizeImage(file, { maxWidth: 1200, quality: 0.8 });

        newImages.push({
          id: `new-${Date.now()}-${Math.random()}`,
          image_url: optimized.previewUrl,
          display_order: images.length + newImages.length,
          isNew: true,
          file: optimized.file,
        });
      } catch {
        // Fallback to original
        const reader = new FileReader();
        const previewUrl = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newImages.push({
          id: `new-${Date.now()}-${Math.random()}`,
          image_url: previewUrl,
          display_order: images.length + newImages.length,
          isNew: true,
          file,
        });
      }
    }

    setUploading(false);
    onChange([...images, ...newImages]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = async (imageId: string) => {
    const image = images.find(img => img.id === imageId);
    
    // If it's an existing image (not new), delete from database
    if (image && !image.isNew && productId) {
      try {
        const { error } = await supabase
          .from('product_images')
          .delete()
          .eq('id', imageId);

        if (error) throw error;
      } catch (error) {
        console.error('Error deleting image:', error);
        toast.error('Failed to delete image');
        return;
      }
    }

    onChange(images.filter(img => img.id !== imageId));
  };

  const uploadNewImages = async (userId: string, productId: string): Promise<boolean> => {
    const newImages = images.filter(img => img.isNew && img.file);
    if (newImages.length === 0) return true;

    setUploading(true);
    try {
      for (const image of newImages) {
        if (!image.file) continue;

        const fileExt = image.file.name.split('.').pop();
        const fileName = `${userId}/${productId}/${Date.now()}-${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(fileName, image.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('products')
          .getPublicUrl(fileName);

        // Insert into database
        const { error: dbError } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            image_url: publicUrl,
            display_order: image.display_order,
          });

        if (dbError) throw dbError;
      }

      return true;
    } catch (error: any) {
      console.error('Error uploading gallery images:', error);
      toast.error('Failed to upload some images');
      return false;
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Additional Images ({images.length}/{maxImages})</Label>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative aspect-square rounded-md overflow-hidden border border-border group"
            >
              <StorageImage
                src={image.image_url}
                alt="Gallery"
                className="w-full h-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(image.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              {image.isNew && (
                <div className="absolute bottom-1 left-1 bg-primary/80 text-primary-foreground text-xs px-1.5 py-0.5 rounded">
                  New
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Button */}
      {images.length < maxImages && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Add Images
            </>
          )}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Add up to {maxImages} additional images. Max 5MB each.
      </p>
    </div>
  );
}

export { type GalleryImage };
