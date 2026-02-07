import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hapticTap } from '@/lib/haptics';

interface ManagerPinScreenProps {
  manager: {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
  };
  onSuccess: () => void;
  onBack: () => void;
}

const PIN_LENGTH = 4;
const MANAGER_PIN_PREFIX = 'welile_mgr_pin_';
const MANAGER_SALT_PREFIX = 'welile_mgr_salt_';
// 10k iterations is fast on mobile (~50ms) while still secure for a local 4-digit PIN
const PBKDF2_ITERATIONS = 10000;

async function hashPin(pin: string, existingSalt?: Uint8Array): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder();
  const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return { hash: hashB64, salt: saltB64 };
}

async function verifyPin(pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const saltArr = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
  const { hash } = await hashPin(pin, saltArr);
  if (hash.length !== storedHash.length) return false;
  let r = 0;
  for (let i = 0; i < hash.length; i++) r |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return r === 0;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ManagerPinScreen({ manager, onSuccess, onBack }: ManagerPinScreenProps) {
  const hashKey = MANAGER_PIN_PREFIX + manager.user_id;
  const saltKey = MANAGER_SALT_PREFIX + manager.user_id;
  const hasPin = !!localStorage.getItem(hashKey);

  const [mode, setMode] = useState<'verify' | 'create' | 'confirm'>(hasPin ? 'verify' : 'create');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const { toast } = useToast();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
    setPin('');
    setError('');
  }, [mode]);

  const handleDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const arr = pin.split('');
    arr[index] = value;
    while (arr.length < PIN_LENGTH) arr.push('');
    const next = arr.join('').slice(0, PIN_LENGTH);
    setPin(next);
    setError('');

    if (value && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit immediately when all digits entered
    if (next.length === PIN_LENGTH && !next.includes('')) {
      setTimeout(() => handleSubmit(next), 100);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const arr = pin.split('');
      arr[index - 1] = '';
      setPin(arr.join(''));
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (currentPin?: string) => {
    const p = currentPin || pin;
    if (p.length !== PIN_LENGTH) return;
    hapticTap();
    setLoading(true);

    try {
      if (mode === 'verify') {
        const storedHash = localStorage.getItem(hashKey)!;
        const storedSalt = localStorage.getItem(saltKey)!;
        const valid = await verifyPin(p, storedHash, storedSalt);
        if (valid) {
          // Navigate immediately — don't wait for toast
          onSuccess();
        } else {
          setError('Wrong PIN. Try again.');
          setPin('');
          triggerShake();
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
          setLoading(false);
        }
      } else if (mode === 'create') {
        setNewPin(p);
        setMode('confirm');
        setLoading(false);
      } else if (mode === 'confirm') {
        if (p === newPin) {
          const { hash, salt } = await hashPin(p);
          localStorage.setItem(hashKey, hash);
          localStorage.setItem(saltKey, salt);
          // Navigate immediately
          onSuccess();
        } else {
          setError("PINs don't match. Start over.");
          setPin('');
          setNewPin('');
          setMode('create');
          triggerShake();
          setLoading(false);
        }
      }
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  };

  const title = mode === 'verify' ? 'Enter Your PIN' : mode === 'create' ? 'Create a PIN' : 'Confirm Your PIN';
  const subtitle = mode === 'verify'
    ? 'Enter your 4-digit PIN to continue'
    : mode === 'create'
      ? 'Set a 4-digit PIN for quick access'
      : 'Re-enter your PIN to confirm';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Manager avatar + name */}
        <div className="text-center space-y-3">
          {manager.avatar_url ? (
            <img
              src={manager.avatar_url}
              alt={manager.full_name}
              className="mx-auto w-16 h-16 rounded-full object-cover ring-2 ring-primary/20"
            />
          ) : (
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
              <span className="text-lg font-bold text-primary">{getInitials(manager.full_name)}</span>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">{manager.full_name}</p>
            <h1 className="text-xl font-bold tracking-tight text-foreground mt-1">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>

        {/* PIN Input */}
        <div className={`flex justify-center gap-3 transition-transform ${shake ? 'animate-shake' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <input
              key={`${mode}-${i}`}
              ref={el => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={pin[i] || ''}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
              autoComplete="off"
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-center text-sm text-destructive font-medium">{error}</p>
        )}

        {/* Forgot PIN option (only in verify mode) */}
        {mode === 'verify' && !loading && (
          <button
            onClick={() => {
              localStorage.removeItem(hashKey);
              localStorage.removeItem(saltKey);
              setMode('create');
              setPin('');
              setError('');
              toast({ title: 'PIN Reset', description: 'Create a new PIN to continue' });
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Forgot PIN? Tap to reset
          </button>
        )}

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
          <Lock className="h-3 w-3" />
          <span>Your PIN is stored securely on this device</span>
        </div>
      </div>
    </div>
  );
}
