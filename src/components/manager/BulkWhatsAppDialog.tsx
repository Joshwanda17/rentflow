import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, Copy, ExternalLink, Check, Save, Trash2, 
  FileText, Plus, X 
} from 'lucide-react';
import { toast } from 'sonner';
import { parsePhoneNumber } from '@/lib/phoneUtils';

interface User {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  created_at: string;
}

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: User[];
}

export default function BulkWhatsAppDialog({
  open,
  onOpenChange,
  selectedUsers,
}: BulkWhatsAppDialogProps) {
  const [message, setMessage] = useState('');
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching templates:', error);
    } else {
      setTemplates(data || []);
    }
    setLoadingTemplates(false);
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter a message to save');
      return;
    }

    setSavingTemplate(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error('You must be logged in to save templates');
      setSavingTemplate(false);
      return;
    }

    const { error } = await supabase
      .from('message_templates')
      .insert({
        name: newTemplateName.trim(),
        content: message.trim(),
        created_by: user.id,
        category: 'whatsapp'
      });

    if (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } else {
      toast.success('Template saved successfully');
      setNewTemplateName('');
      setShowSaveForm(false);
      fetchTemplates();
    }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } else {
      toast.success('Template deleted');
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
    setDeletingId(null);
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    setMessage(template.content);
    toast.success(`Template "${template.name}" loaded`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getWhatsAppLinkWithMessage = (phone: string) => {
    const phoneInfo = parsePhoneNumber(phone);
    const baseLink = phoneInfo.whatsappLink;
    if (message.trim()) {
      return `${baseLink}?text=${encodeURIComponent(message.trim())}`;
    }
    return baseLink;
  };

  const handleCopyNumbers = () => {
    const numbers = selectedUsers.map(u => {
      const phoneInfo = parsePhoneNumber(u.phone);
      return phoneInfo.formatted;
    }).join('\n');
    
    navigator.clipboard.writeText(numbers);
    setCopiedNumbers(true);
    toast.success(`${selectedUsers.length} phone numbers copied to clipboard`);
    
    setTimeout(() => setCopiedNumbers(false), 2000);
  };

  const handleOpenSingleChat = (phone: string, index: number) => {
    setOpeningIndex(index);
    window.open(getWhatsAppLinkWithMessage(phone), '_blank');
    setTimeout(() => setOpeningIndex(null), 500);
  };

  const handleOpenAllChats = () => {
    if (selectedUsers.length > 10) {
      toast.warning('Opening more than 10 chats may be blocked by your browser. Consider opening in batches.');
    }
    
    selectedUsers.forEach((user, index) => {
      setTimeout(() => {
        window.open(getWhatsAppLinkWithMessage(user.phone), '_blank');
      }, index * 300);
    });
    
    toast.success(`Opening ${selectedUsers.length} WhatsApp chats...`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            Message {selectedUsers.length} Users
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp message to selected users
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="compose" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates ({templates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
            {/* Message Template */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message</Label>
                {message.trim() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSaveForm(!showSaveForm)}
                    className="h-7 text-xs gap-1"
                  >
                    <Save className="h-3 w-3" />
                    Save as Template
                  </Button>
                )}
              </div>
              <Textarea
                id="message"
                placeholder="Type your message here... This will be pre-filled when opening each chat."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/1000
              </p>
            </div>

            {/* Save Template Form */}
            {showSaveForm && (
              <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
                <Input
                  placeholder="Template name..."
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="flex-1 h-8"
                  maxLength={50}
                />
                <Button
                  size="sm"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                  className="h-8"
                >
                  {savingTemplate ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowSaveForm(false);
                    setNewTemplateName('');
                  }}
                  className="h-8 px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Selected Users List */}
            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between">
                <Label>Recipients ({selectedUsers.length})</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyNumbers}
                  className="h-7 text-xs gap-1"
                >
                  {copiedNumbers ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy Numbers
                    </>
                  )}
                </Button>
              </div>
              
              <ScrollArea className="flex-1 min-h-[120px] max-h-[180px] rounded-lg border">
                <div className="p-2 space-y-1">
                  {selectedUsers.map((user, index) => {
                    const phoneInfo = parsePhoneNumber(user.phone);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              {!phoneInfo.isUgandan && <span>{phoneInfo.countryFlag}</span>}
                              {phoneInfo.formatted}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleOpenSingleChat(user.phone, index)}
                        >
                          {openingIndex === index ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <ExternalLink className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="templates" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[280px]">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No templates saved yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Write a message and click "Save as Template"
                  </p>
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUseTemplate(template)}
                            className="h-7 text-xs gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Use
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={deletingId === template.id}
                            className="h-7 px-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {template.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleOpenAllChats}
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
          >
            <MessageCircle className="h-4 w-4" />
            Open All Chats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}