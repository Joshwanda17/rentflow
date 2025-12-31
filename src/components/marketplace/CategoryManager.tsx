import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings2, Plus, Loader2, Trash2, Edit2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Category {
  id: string;
  name: string;
  color: string;
  agent_id: string;
}

const COLOR_OPTIONS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

interface CategoryManagerProps {
  onCategoriesChange?: () => void;
}

export function CategoryManager({ onCategoriesChange }: CategoryManagerProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[4]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    if (open && user) {
      fetchCategories();
    }
  }, [open, user]);

  const fetchCategories = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .eq('agent_id', user.id)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!user || !newCategoryName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_categories')
        .insert({
          agent_id: user.id,
          name: newCategoryName.trim().toLowerCase(),
          color: newCategoryColor,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Category already exists');
          return;
        }
        throw error;
      }

      toast.success('Category added');
      setNewCategoryName('');
      setNewCategoryColor(COLOR_OPTIONS[4]);
      fetchCategories();
      onCategoriesChange?.();
    } catch (error: any) {
      toast.error('Failed to add category', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_categories')
        .update({
          name: editName.trim().toLowerCase(),
          color: editColor,
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Category updated');
      cancelEdit();
      fetchCategories();
      onCategoriesChange?.();
    } catch (error: any) {
      toast.error('Failed to update category', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Category deleted');
      fetchCategories();
      onCategoriesChange?.();
    } catch (error: any) {
      toast.error('Failed to delete category', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Manage Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Create custom categories for your products.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add New Category */}
          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
            <Label>Add New Category</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Category name..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <Button 
                size="icon" 
                onClick={handleAddCategory}
                disabled={saving || !newCategoryName.trim()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCategoryColor(color)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    newCategoryColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Category List */}
          <div className="space-y-2">
            <Label>Your Categories ({categories.length})</Label>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No custom categories yet. Add one above!
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-4">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border/50"
                    >
                      {editingId === category.id ? (
                        <>
                          <div 
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: editColor }}
                          />
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 flex-1"
                          />
                          <div className="flex gap-1">
                            {COLOR_OPTIONS.slice(0, 5).map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setEditColor(color)}
                                className={`w-4 h-4 rounded-full ${
                                  editColor === color ? 'ring-1 ring-offset-1 ring-primary' : ''
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleUpdateCategory(category.id)}
                            disabled={saving}
                          >
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div 
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="flex-1 text-sm capitalize">{category.name}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startEdit(category)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteCategory(category.id)}
                            disabled={saving}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Default Categories Note */}
          <div className="text-xs text-muted-foreground">
            <p className="font-medium mb-1">Default categories:</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">food</Badge>
              <Badge variant="outline" className="text-xs">drinks</Badge>
              <Badge variant="outline" className="text-xs">groceries</Badge>
              <Badge variant="outline" className="text-xs">general</Badge>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
