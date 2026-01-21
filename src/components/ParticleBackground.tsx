import React, { memo } from 'react';

// Simplified, stable particle background using CSS only - no JS animations
function ParticleBackgroundComponent() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
    </div>
  );
}

export const ParticleBackground = memo(ParticleBackgroundComponent);
