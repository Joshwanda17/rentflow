import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Camera, PenLine, MessageSquare, ShieldCheck, WifiOff, Loader2,
  AlertCircle, Trash2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOffline } from '@/contexts/OfflineContext';
import { formatUGX } from '@/lib/rentCalculations';
import {
  listDrafts,
  attachProof,
  deleteDraft,
  type OfflineCollectionDraft,
  type ProofType,
} from '@/lib/offlineCollectionDrafts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AgentPendingSyncDrawer({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const [drafts, setDrafts] = useState<OfflineCollectionDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [proofType, setProofType] = useState<ProofType>('photo');
  const [smsCode, setSmsCode] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [savingProof, setSavingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items = await listDrafts(user.id);
      setDrafts(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) refresh(); }, [open, user?.id]);

  const activeDraft = drafts.find(d => d.draft_id === activeDraftId) || null;

  const resetProofUI = () => {
    setProofType('photo');
    setSmsCode('');
    setPhotoDataUrl(null);
    setSignatureDataUrl(null);
  };

  const closeProofPanel = () => {
    setActiveDraftId(null);
    resetProofUI();
  };

  const handlePhotoPick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Signature canvas helpers
  const startSig = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const rect = sigCanvasRef.current!.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };
  const moveSig = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const rect = sigCanvasRef.current!.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'hsl(var(--foreground))';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const endSig = () => {
    drawingRef.current = false;
    const dataUrl = sigCanvasRef.current?.toDataURL('image/png') || null;
    setSignatureDataUrl(dataUrl);
  };
  const clearSig = () => {
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx || !sigCanvasRef.current) return;
    ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height);
    setSignatureDataUrl(null);
  };

  const proofIsReady = (() => {
    if (proofType === 'photo') return !!photoDataUrl;
    if (proofType === 'signature') return !!signatureDataUrl;
    if (proofType === 'sms_code') return /^\d{4,8}$/.test(smsCode);
    return false;
  })();

  const handleAttachProof = async () => {
    if (!activeDraft || !proofIsReady) return;
    setSavingProof(true);
    try {
      await attachProof(activeDraft.draft_id, {
        type: proofType,
        photo_data_url: proofType === 'photo' ? photoDataUrl! : undefined,
        signature_data_url: proofType === 'signature' ? signatureDataUrl! : undefined,
        sms_code: proofType === 'sms_code' ? smsCode : undefined,
        captured_at: new Date().toISOString(),
      });
      toast.success('Proof attached', {
        description: 'Draft is ready to submit when you have data.',
      });
      closeProofPanel();
      await refresh();
    } catch (err: any) {
      toast.error('Could not save proof', { description: err?.message || 'Try again.' });
    } finally {
      setSavingProof(false);
    }
  };

  const handleDelete = async (draftId: string) => {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    await deleteDraft(draftId);
    await refresh();
    toast('Draft deleted');
  };

  const awaitingProof = drafts.filter(d => d.status === 'awaiting_proof');
  const ready = drafts.filter(d => d.status === 'ready_to_submit');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Pending Sync
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Drafts saved on this phone. They are not visible to Welile Operations until you attach proof and submit.
          </p>
        </SheetHeader>

        {!isOnline && (
          <div className="mt-3 rounded-xl bg-warning/10 border border-warning/30 p-2.5 flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-warning" />
            <p className="text-[11px] text-muted-foreground">
              You're offline. You can attach proof now and submit once you have data.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px]">{awaitingProof.length} need proof</Badge>
            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30 hover:bg-primary/10">
              {ready.length} ready to submit
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {activeDraft ? (
          /* ───── Proof capture panel ───── */
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tenant</span>
                <span className="font-semibold">{activeDraft.tenant_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-bold">{formatUGX(activeDraft.amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Receipt</span>
                <span className="font-mono">{activeDraft.provisional_receipt_no}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs">Choose proof type</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <Button
                  type="button" variant={proofType === 'photo' ? 'default' : 'outline'}
                  onClick={() => setProofType('photo')} className="h-16 flex-col gap-1"
                >
                  <Camera className="h-4 w-4" /><span className="text-[10px]">Photo</span>
                </Button>
                <Button
                  type="button" variant={proofType === 'signature' ? 'default' : 'outline'}
                  onClick={() => setProofType('signature')} className="h-16 flex-col gap-1"
                >
                  <PenLine className="h-4 w-4" /><span className="text-[10px]">Signature</span>
                </Button>
                <Button
                  type="button" variant={proofType === 'sms_code' ? 'default' : 'outline'}
                  onClick={() => setProofType('sms_code')} className="h-16 flex-col gap-1"
                >
                  <MessageSquare className="h-4 w-4" /><span className="text-[10px]">SMS Code</span>
                </Button>
              </div>
            </div>

            {proofType === 'photo' && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoPick(f);
                  }}
                />
                {photoDataUrl ? (
                  <div className="rounded-xl overflow-hidden border border-border">
                    <img src={photoDataUrl} alt="Proof" className="w-full max-h-64 object-cover" />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full rounded-none">
                      Retake
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-dashed">
                    <Camera className="h-5 w-5 mr-2" /> Take photo of cash + tenant
                  </Button>
                )}
              </div>
            )}

            {proofType === 'signature' && (
              <div className="space-y-2">
                <div className="rounded-xl border border-dashed border-border bg-background">
                  <canvas
                    ref={sigCanvasRef}
                    width={400}
                    height={160}
                    className="w-full touch-none"
                    onPointerDown={startSig}
                    onPointerMove={moveSig}
                    onPointerUp={endSig}
                    onPointerLeave={endSig}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearSig} className="flex-1">Clear</Button>
                  <p className="text-[10px] text-muted-foreground self-center flex-1 text-right">
                    Tenant signs above
                  </p>
                </div>
              </div>
            )}

            {proofType === 'sms_code' && (
              <div className="space-y-2">
                <Label className="text-xs">SMS code from tenant</Label>
                <Input
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="123456"
                  inputMode="numeric"
                  className="h-12 text-center text-lg font-mono font-bold tracking-widest"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ask the tenant to forward the SMS confirmation code Welile sent them.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={closeProofPanel} className="flex-1" disabled={savingProof}>
                Cancel
              </Button>
              <Button
                onClick={handleAttachProof}
                disabled={!proofIsReady || savingProof}
                className="flex-1 font-bold"
              >
                {savingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Attach Proof'}
              </Button>
            </div>
          </div>
        ) : (
          /* ───── Draft list ───── */
          <div className="mt-4 space-y-2">
            {drafts.length === 0 && !loading && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-success/50" />
                No drafts on this device.
              </div>
            )}

            {drafts.map(draft => (
              <div key={draft.draft_id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">{draft.tenant_name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {draft.provisional_receipt_no} · {relativeTime(draft.captured_at)}
                    </p>
                  </div>
                  <p className="font-mono font-bold text-sm">{formatUGX(draft.amount)}</p>
                </div>

                {draft.status === 'awaiting_proof' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-warning">
                    <AlertCircle className="h-3 w-3" /> Needs proof before submission
                  </div>
                )}
                {draft.status === 'ready_to_submit' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <ShieldCheck className="h-3 w-3" /> Proof attached ({draft.proof_bundle?.type})
                  </div>
                )}
                {draft.status === 'rejected' && draft.last_error && (
                  <div className="text-[11px] text-destructive">{draft.last_error}</div>
                )}

                <div className="flex gap-2 pt-1">
                  {draft.status === 'awaiting_proof' && (
                    <Button
                      size="sm" className="flex-1"
                      onClick={() => { resetProofUI(); setActiveDraftId(draft.draft_id); }}
                    >
                      Add Proof
                    </Button>
                  )}
                  {draft.status === 'ready_to_submit' && (
                    <Button size="sm" className="flex-1" disabled>
                      Submit (coming next)
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleDelete(draft.draft_id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}