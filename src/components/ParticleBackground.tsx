import { motion } from 'framer-motion';
import React, { useMemo, useEffect, useState, memo } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

interface ParticleItemProps {
  particle: Particle;
}

interface GlowOrbProps {
  index: number;
}

// Particle item component
function ParticleItemComponent({ particle }: ParticleItemProps) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary will-change-transform"
      style={{
        left: `${particle.x}%`,
        top: `${particle.y}%`,
        width: particle.size,
        height: particle.size,
        opacity: particle.opacity,
        transform: 'translateZ(0)',
      }}
      animate={{
        y: [0, -80, 0],
        opacity: [particle.opacity, particle.opacity * 1.3, particle.opacity],
      }}
      transition={{
        duration: particle.duration,
        delay: particle.delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

const ParticleItem = memo(ParticleItemComponent);
ParticleItem.displayName = 'ParticleItem';

// Glow orb component
function GlowOrbComponent({ index }: GlowOrbProps) {
  return (
    <motion.div
      className="absolute rounded-full will-change-transform"
      style={{
        left: `${15 + index * 18}%`,
        top: `${25 + (index % 2) * 30}%`,
        width: 10 + index * 2,
        height: 10 + index * 2,
        background: `radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, hsl(var(--primary) / 0) 70%)`,
        transform: 'translateZ(0)',
      }}
      animate={{
        y: [0, -40, 0],
        scale: [1, 1.2, 1],
      }}
      transition={{
        duration: 15 + index * 3,
        delay: index * 1.2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

const GlowOrb = memo(GlowOrbComponent);
GlowOrb.displayName = 'GlowOrb';

// Main particle background component
function ParticleBackgroundComponent() {
  const [particleCount, setParticleCount] = useState(15);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasLowMemory = 'deviceMemory' in navigator && (navigator as any).deviceMemory < 4;
    const hasSlowConnection = 'connection' in navigator && 
      ((navigator as any).connection?.effectiveType === '2g' || (navigator as any).connection?.effectiveType === 'slow-2g');

    if (prefersReducedMotion) {
      setParticleCount(0);
    } else if (isMobile || hasLowMemory || hasSlowConnection) {
      setParticleCount(12);
    } else {
      setParticleCount(25);
    }
  }, []);
  
  const particles = useMemo<Particle[]>(() => {
    if (particleCount === 0) return [];
    
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: ((i * 37) % 100),
      y: ((i * 53) % 100),
      size: (i % 3) + 2,
      duration: 18 + (i % 8) * 2,
      delay: (i % 6) * 0.8,
      opacity: 0.15 + (i % 4) * 0.08,
    }));
  }, [particleCount]);

  const orbCount = useMemo(() => Math.min(4, Math.floor(particleCount / 4)), [particleCount]);

  if (particleCount === 0) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <ParticleItem key={particle.id} particle={particle} />
      ))}
      
      {Array.from({ length: orbCount }, (_, i) => (
        <GlowOrb key={`orb-${i}`} index={i} />
      ))}
    </div>
  );
}

export const ParticleBackground = memo(ParticleBackgroundComponent);
