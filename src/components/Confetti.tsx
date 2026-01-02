import { useCallback, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
}

export function useConfetti() {
  const fire = useCallback((options?: confetti.Options) => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    // First burst - centered
    confetti({
      ...defaults,
      ...options,
      particleCount: count * 0.25,
      spread: 26,
      startVelocity: 55,
      scalar: 1.2,
      colors: ['#10b981', '#22c55e', '#4ade80'],
    });

    // Second burst - wider spread
    confetti({
      ...defaults,
      ...options,
      particleCount: count * 0.2,
      spread: 60,
      colors: ['#f59e0b', '#fbbf24', '#fcd34d'],
    });

    // Third burst - more particles
    confetti({
      ...defaults,
      ...options,
      particleCount: count * 0.35,
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#8b5cf6', '#a78bfa', '#c4b5fd'],
    });

    // Fourth burst - confetti shower
    confetti({
      ...defaults,
      ...options,
      particleCount: count * 0.1,
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#ec4899', '#f472b6', '#f9a8d4'],
    });

    // Side bursts
    confetti({
      ...defaults,
      particleCount: count * 0.05,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: ['#06b6d4', '#22d3ee', '#67e8f9'],
    });

    confetti({
      ...defaults,
      particleCount: count * 0.05,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: ['#14b8a6', '#2dd4bf', '#5eead4'],
    });
  }, []);

  const fireSuccess = useCallback(() => {
    // Main celebration burst
    fire();

    // Follow-up bursts for extended celebration
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        colors: ['#10b981', '#22c55e', '#f59e0b', '#fbbf24'],
        zIndex: 9999,
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        colors: ['#8b5cf6', '#a78bfa', '#ec4899', '#f472b6'],
        zIndex: 9999,
      });
    }, 250);

    // Final burst
    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'],
        zIndex: 9999,
      });
    }, 500);
  }, [fire]);

  return { fire, fireSuccess };
}

export function Confetti({ trigger, onComplete }: ConfettiProps) {
  const { fireSuccess } = useConfetti();
  const hasFired = useRef(false);

  useEffect(() => {
    if (trigger && !hasFired.current) {
      hasFired.current = true;
      fireSuccess();
      
      // Reset after animation completes
      setTimeout(() => {
        hasFired.current = false;
        onComplete?.();
      }, 3000);
    }
  }, [trigger, fireSuccess, onComplete]);

  return null;
}

export default Confetti;
