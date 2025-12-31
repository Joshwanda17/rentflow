import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, X, Trash2, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GalleryImageUploader, type GalleryImage } from './GalleryImageUploader';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  active: boolean;
  discount_percentage?: number | null;
  discount_ends_at?: string | null;
}

interface EditProductDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductUpdated?: () => void;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_CATEGORIES = [
  { value: 'food', label: 'Food' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'general', label: 'General' },
];

export function EditProductDialog({ product, open, onOpenChange, onProductUpdated }: EditProductDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'general',
    stock: '',
    discount_percentage: '',
    discount_ends_at: '',
  });

  const fetchGalleryImages = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('product_images')
        .select('id, image_url, display_order')
        .eq('product_id', productId)
        .order('display_order');

      if (error) throw error;
      setGalleryImages(data || []);
    } catch (error) {
      console.error('Error fetching gallery images:', error);
    }
  };

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        category: product.category,
        stock: product.stock.toString(),
        discount_percentage: product.discount_percentage?.toString() || '',
        discount_ends_at: product.discount_ends_at ? product.discount_ends_at.slice(0, 16) : '',
      });
      setImagePreview(product.image_url);
      setImageFile(null);
      setRemoveCurrentImage(false);
      fetchGalleryImages(product.id);
    }
  }, [product]);

  useEffect(() => {
    if (open && user) {
      fetchCustomCategories();
    }
  }, [open, user]);

  const fetchCustomCategories = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .eq('agent_id', user.id)
        .order('name');

      if (error) throw error;
      setCustomCategories(data || []);
    } catch (error) {
      console.error('Error fetching custom categories:', error);
    }
  };

  const allCategories = [
    ...DEFAULT_CATEGORIES,
    ...customCategories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase() + c.name.slice(1) }))
  ];

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setImageFile(file);
    setRemoveCurrentImage(false);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveCurrentImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (userId: string): Promise<string | null> => {
    if (!imageFile) return null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(fileName, imageFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    
    if (!formData.name || !formData.price || !formData.stock) {
      toast.error('Please fill in all required fields');
      return;
    }

    const price = parseFloat(formData.price);
    const stock = parseInt(formData.stock);

    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price');
      return;
    }

    if (isNaN(stock) || stock < 0) {
      toast.error('Please enter a valid stock quantity');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let imageUrl: string | null = product.image_url;
      
      // Upload new image if selected
      if (imageFile) {
        imageUrl = await uploadImage(user.id);
      } else if (removeCurrentImage) {
        imageUrl = null;
      }

      const discountPercentage = formData.discount_percentage ? parseInt(formData.discount_percentage) : null;
      const discountEndsAt = formData.discount_ends_at ? new Date(formData.discount_ends_at).toISOString() : null;

      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name,
          description: formData.description || null,
          price,
          category: formData.category,
          stock,
          image_url: imageUrl,
          discount_percentage: discountPercentage,
          discount_ends_at: discountEndsAt,
        })
        .eq('id', product.id);

      if (error) throw error;

      // Upload new gallery images
      const newGalleryImages = galleryImages.filter(img => img.isNew && img.file);
      for (const image of newGalleryImages) {
        if (!image.file) continue;

        const fileExt = image.file.name.split('.').pop();
        const fileName = `${user.id}/${product.id}/${Date.now()}-${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(fileName, image.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Error uploading gallery image:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('products')
          .getPublicUrl(fileName);

        await supabase
          .from('product_images')
          .insert({
            product_id: product.id,
            image_url: publicUrl,
            display_order: image.display_order,
          });
      }

      toast.success('Product updated successfully!');
      onOpenChange(false);
      onProductUpdated?.();
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };


  const handleDelete = async () => {
    if (!product) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      toast.success('Product deleted successfully');
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onProductUpdated?.();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update your product details. Changes will be visible immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Product Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 border-dashed flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload image
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Max 5MB • JPG, PNG, WebP
                  </span>
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Product Name *</Label>
              <Input
                id="edit-name"
                placeholder="e.g., Fresh Bread"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Describe your product..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (UGX) *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  placeholder="5000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  min="1"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-stock">Stock Quantity *</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  placeholder="10"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  min="0"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Discount Section */}
            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-4">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-destructive" />
                <Label className="font-semibold">Promotional Discount</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-discount">Discount %</Label>
                  <Input
                    id="edit-discount"
                    type="number"
                    placeholder="0"
                    value={formData.discount_percentage}
                    onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
                    min="0"
                    max="100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-discount-end">Ends At</Label>
                  <Input
                    id="edit-discount-end"
                    type="datetime-local"
                    value={formData.discount_ends_at}
                    onChange={(e) => setFormData({ ...formData, discount_ends_at: e.target.value })}
                  />
                </div>
              </div>

              {formData.discount_percentage && parseInt(formData.discount_percentage) > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Sale price: </span>
                  UGX {Math.round(parseFloat(formData.price || '0') * (1 - parseInt(formData.discount_percentage) / 100)).toLocaleString()}
                  {!formData.discount_ends_at && (
                    <span className="text-warning"> (No end date - discount runs indefinitely)</span>
                  )}
                </div>
              )}
            </div>

            {/* Gallery Images */}
            <GalleryImageUploader
              productId={product?.id}
              images={galleryImages}
              onChange={setGalleryImages}
              maxImages={5}
            />
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="destructive" 
                className="gap-2"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button type="submit" className="flex-1" disabled={loading || uploading}>
                {loading || uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploading ? 'Uploading...' : 'Saving...'}
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "{product?.name}" from your shop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
