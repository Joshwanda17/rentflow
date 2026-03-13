import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAccount: (name: string, color: string) => void;
}

const COLORS = [
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

export function CreateAccountDialog({ open, onOpenChange, onCreateAccount }: CreateAccountDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');

  const handleCreate = () => {
    if (name.trim()) {
      onCreateAccount(name.trim(), color);
      setName('');
      setColor('blue');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Support Account</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Rent Support, Monthly Rewards..."
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label>Account Color</Label>
            <RadioGroup value={color} onValueChange={setColor} className="flex gap-3">
              {COLORS.map((c) => (
                <div key={c.id} className="flex items-center">
                  <RadioGroupItem value={c.id} id={c.id} className="sr-only" />
                  <Label
                    htmlFor={c.id}
                    className={`w-8 h-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background transition-all ${c.class} ${
                      color === c.id ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/50'
                    }`}
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
