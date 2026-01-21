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

// Success fanfare sound for bulk completion
export function playSuccessSound() {
  // Check if sounds are enabled
  if (!areNotificationSoundsEnabled()) {
    return;
  }

  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play a celebratory ascending arpeggio
    const notes = [
      { freq: 523.25, delay: 0 },      // C5
      { freq: 659.25, delay: 0.08 },   // E5
      { freq: 783.99, delay: 0.16 },   // G5
      { freq: 1046.5, delay: 0.24 },   // C6
    ];
    
    notes.forEach(({ freq, delay }) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now + delay);
      
      gainNode.gain.setValueAtTime(0, now + delay);
      gainNode.gain.linearRampToValueAtTime(0.2, now + delay + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.3);
      
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.35);
    });
  } catch (error) {
    console.log('Audio not supported:', error);
  }
}

// New opportunity sound - attention-grabbing but pleasant
export function playOpportunitySound() {
  // Check if sounds are enabled
  if (!areNotificationSoundsEnabled()) {
    return;
  }

  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play a rising two-note alert that sounds like money/opportunity
    const now = ctx.currentTime;
    
    // First note - lower
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.start(now);
    osc1.stop(now + 0.15);
    
    // Second note - higher (creates ascending effect)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);
    
    // Third sparkle note
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1318.5, now + 0.25); // E6
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.setValueAtTime(0.2, now + 0.25);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc3.start(now + 0.25);
    osc3.stop(now + 0.5);
  } catch (error) {
    console.log('Audio not supported:', error);
  }
}
