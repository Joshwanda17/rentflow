// Simple notification sound using Web Audio API
// No external dependencies required

import { areNotificationSoundsEnabled, getNotificationSoundType } from '@/hooks/useAppPreferences';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Play notification sound respecting user preferences
export function playNotificationSound(typeOverride?: 'ding' | 'pop' | 'chime') {
  // Check if sounds are enabled
  if (!areNotificationSoundsEnabled()) {
    return;
  }

  // Use the user's preferred sound type, or override if specified
  const type = typeOverride || getNotificationSoundType();

  try {
    const ctx = getAudioContext();
    
    // Resume context if suspended (required for some browsers)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'ding':
        // Short, pleasant notification ding
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now); // A5
        oscillator.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // A6
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
        
      case 'pop':
        // Quick pop sound
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, now);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
        
      case 'chime':
        // Two-tone chime
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.15); // E5
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.setValueAtTime(0.25, now + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;
    }
  } catch (error) {
    // Silently fail if audio is not supported
    console.log('Audio not supported:', error);
  }
}

// Cash register / coin sound for claims
export function playCoinSound() {
  // Check if sounds are enabled
  if (!areNotificationSoundsEnabled()) {
    return;
  }

  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Create multiple oscillators for a richer "coin" sound
    const frequencies = [1318.5, 1568, 2093]; // E6, G6, C7
    
    frequencies.forEach((freq, index) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      const now = ctx.currentTime;
      const delay = index * 0.03;
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now + delay);
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.2);
      
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.25);
    });
  } catch (error) {
    console.log('Audio not supported:', error);
  }
}

// Urgency alert sound for low spots
export function playUrgencySound() {
  // Check if sounds are enabled
  if (!areNotificationSoundsEnabled()) {
    return;
  }

  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(800, now);
    oscillator.frequency.setValueAtTime(600, now + 0.1);
    oscillator.frequency.setValueAtTime(800, now + 0.2);
    
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    
    oscillator.start(now);
    oscillator.stop(now + 0.35);
  } catch (error) {
    console.log('Audio not supported:', error);
  }
}
