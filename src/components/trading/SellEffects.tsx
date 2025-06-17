import { FC, useEffect, useState, useCallback, useRef } from 'react';

interface SellEffectsProps {
  isWin: boolean | null;
  show: boolean;
  onAnimationComplete: () => void;
  multiplier?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  velocity: { x: number; y: number };
  rotation: number;
  rotationSpeed: number;
  shape: string;
  opacity: number;
}

const SellEffects: FC<SellEffectsProps> = ({ isWin, show, onAnimationComplete, multiplier = 0 }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const animationRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(false);
  const hasCompletedRef = useRef<boolean>(false);
  
  // Enhanced visual effects based on multiplier
  const getMultiplierTier = useCallback((multiplier: number) => {
    if (multiplier >= 20) return 'mega';
    if (multiplier >= 10) return 'super';
    if (multiplier >= 5) return 'high';
    if (multiplier >= 2) return 'medium';
    return 'low';
  }, []);
  
  // Cleanup function to stop animation and clear state
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    isAnimatingRef.current = false;
    frameCountRef.current = 0;
    setParticles([]);
  }, []);

  // Complete animation and trigger callback
  const completeAnimation = useCallback(() => {
    if (hasCompletedRef.current) return; // Prevent multiple completions
    
    hasCompletedRef.current = true;
    cleanup();
    
    // Small delay to ensure cleanup is complete
    setTimeout(() => {
      onAnimationComplete();
      hasCompletedRef.current = false; // Reset for next animation
    }, 50);
  }, [cleanup, onAnimationComplete]);
  
  useEffect(() => {
    // Reset completion flag when show changes
    if (show) {
      hasCompletedRef.current = false;
    }
    
    // Don't start if already animating or if not showing
    if (!show || isAnimatingRef.current) {
      if (!show) {
        cleanup(); // Clean up if hiding
      }
      return;
    }
    
    // Mark as animating
    isAnimatingRef.current = true;
    frameCountRef.current = 0;
    
    // Create particles
    const newParticles: Particle[] = [];
    const tier = getMultiplierTier(multiplier);
    
    // Particle count based on win/loss and multiplier tier
    const particleCount = isWin 
      ? (tier === 'mega' ? 80 : tier === 'super' ? 60 : tier === 'high' ? 40 : 30)
      : 20;
    
    // Colors based on outcome and multiplier tier
    const colors = isWin 
      ? (
        tier === 'mega' 
          ? ['#FFD700', '#FFA500', '#32CD32', '#ffffff', '#3b82f6', '#a855f7'] 
        : tier === 'super'
          ? ['#FFD700', '#FFA500', '#32CD32', '#ffffff', '#3b82f6']
        : tier === 'high'
          ? ['#FFD700', '#FFA500', '#32CD32', '#ffffff']
        : ['#22c55e', '#4ade80', '#86efac', '#ffffff']
      )
      : ['#FF4136', '#ef4444', '#b91c1c', '#7f1d1d']; 
    
    // Shapes for particles
    const shapes = isWin 
      ? ['circle', 'star', 'diamond', 'circle']
      : ['square', 'triangle', 'square', 'x'];
    
    for (let i = 0; i < particleCount; i++) {
      const size = isWin 
        ? Math.random() * (
            tier === 'mega' ? 18 : 
            tier === 'super' ? 14 : 
            tier === 'high' ? 12 : 10
          ) + 5 
        : Math.random() * 6 + 2; 
      
      // More upward and outward velocity for higher multipliers
      const velocityFactor = isWin 
        ? (tier === 'mega' ? 25 : tier === 'super' ? 20 : tier === 'high' ? 18 : 15)
        : 8;
      
      const velocity = {
        x: (Math.random() - 0.5) * velocityFactor,
        y: (Math.random() - 0.5) * velocityFactor - (isWin ? velocityFactor / 2 : 2)
      };
      
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      
      newParticles.push({
        id: i,
        x: 50, // Center X%
        y: 50, // Center Y%
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
        velocity,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        shape,
        opacity: isWin ? 0.9 : 0.7
      });
    }
    
    setParticles(newParticles);
    
    // Animation frames
    const maxFrames = isWin && tier === 'mega' ? 180 : isWin && tier === 'super' ? 150 : 120;
    
    const animate = () => {
      // Check if we should stop animating
      if (!isAnimatingRef.current || frameCountRef.current >= maxFrames) {
        completeAnimation();
        return;
      }
      
      frameCountRef.current++;
      
      setParticles(prevParticles => {
        if (!isAnimatingRef.current) return []; // Stop updating if not animating
        
        return prevParticles.map(particle => {
          // Apply gravity for win effect (particles fall down)
          const gravity = isWin ? 0.2 : 0.3;
          const fadeRate = 1 / maxFrames; // Gradual fade out
          
          return {
            ...particle,
            x: particle.x + particle.velocity.x,
            y: particle.y + particle.velocity.y + gravity,
            velocity: {
              x: particle.velocity.x * 0.98, // Friction
              y: particle.velocity.y + gravity
            },
            rotation: particle.rotation + particle.rotationSpeed,
            opacity: Math.max(0, particle.opacity - fadeRate) // Fade out over time
          };
        }).filter(particle => 
          // Remove particles that are too far off screen or completely faded
          particle.x > -20 && particle.x < 120 && 
          particle.y > -20 && particle.y < 120 && 
          particle.opacity > 0.01
        );
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
    
    // Cleanup function for effect
    return cleanup;
  }, [show, isWin, multiplier, getMultiplierTier, cleanup, completeAnimation]);
  
  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  if (!show) return null;
  
  // Render different particle shapes
  const renderParticle = (particle: Particle) => {
    const style = {
      left: `${particle.x}%`,
      top: `${particle.y}%`,
      width: `${particle.size}px`,
      height: `${particle.size}px`,
      backgroundColor: particle.color,
      transform: `rotate(${particle.rotation}deg) translate(-50%, -50%)`,
      opacity: particle.opacity,
      position: 'absolute' as const,
      pointerEvents: 'none' as const
    };

    switch (particle.shape) {
      case 'circle':
        return (
          <div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              ...style,
              borderRadius: '50%'
            }}
          />
        );
      case 'square':
        return (
          <div
            key={particle.id}
            className="absolute"
            style={style}
          />
        );
      case 'diamond':
        return (
          <div
            key={particle.id}
            className="absolute"
            style={{
              ...style,
              transform: `rotate(45deg) translate(-50%, -50%)`,
            }}
          />
        );
      case 'triangle':
        return (
          <div
            key={particle.id}
            className="absolute"
            style={{
              ...style,
              width: 0,
              height: 0,
              backgroundColor: 'transparent',
              borderLeft: `${particle.size / 2}px solid transparent`,
              borderRight: `${particle.size / 2}px solid transparent`,
              borderBottom: `${particle.size}px solid ${particle.color}`,
            }}
          />
        );
      case 'star':
        return (
          <div
            key={particle.id}
            className="absolute"
            style={{
              ...style,
              borderRadius: '50%',
              boxShadow: `0 0 ${particle.size/2}px ${particle.color}`,
              background: `radial-gradient(circle, ${particle.color} 0%, transparent 70%)`,
            }}
          />
        );
      case 'x':
        return (
          <div key={particle.id} className="absolute" style={{ ...style, backgroundColor: 'transparent' }}>
            <div style={{ 
              position: 'absolute',
              width: `${particle.size}px`,
              height: `${particle.size/4}px`,
              backgroundColor: particle.color,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(45deg)',
              opacity: particle.opacity
            }} />
            <div style={{ 
              position: 'absolute',
              width: `${particle.size}px`,
              height: `${particle.size/4}px`,
              backgroundColor: particle.color,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-45deg)',
              opacity: particle.opacity
            }} />
          </div>
        );
      default:
        return (
          <div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              ...style,
              borderRadius: '50%'
            }}
          />
        );
    }
  };
  
  // Different messages based on multiplier
  const getWinMessage = (multiplier: number) => {
    if (multiplier >= 20) return "MEGA WIN!";
    if (multiplier >= 10) return "SUPER WIN!";
    if (multiplier >= 5) return "BIG WIN!";
    if (multiplier >= 2) return "WIN!";
    return "WIN";
  };
  
  const getLossMessage = () => {
    return "CRASH!";
  };
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-30">
      {/* Particles */}
      {particles.map(particle => renderParticle(particle))}
      
      {/* Flash effect overlay */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: isWin 
            ? `rgba(255, 215, 0, ${getMultiplierTier(multiplier) === 'mega' ? 0.4 : 0.2})` 
            : 'rgba(255, 0, 0, 0.2)',
          animation: 'flash-animation 0.5s ease-out'
        }}
      />
      
      {/* Win message with multiplier-based styling */}
      {isWin && (
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-6xl font-dynapuff font-bold"
          style={{ 
            color: multiplier >= 10 ? '#FFD700' : '#fbbf24',
            textShadow: multiplier >= 10 
              ? '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4)' 
              : '0 0 10px rgba(255, 215, 0, 0.8)', 
            animation: multiplier >= 10 ? 'mega-scale-up 0.7s ease-out' : 'scale-up 0.5s ease-out',
            fontSize: multiplier >= 20 ? '6rem' : multiplier >= 10 ? '5rem' : '4rem',
            pointerEvents: 'none'
          }}
        >
          {getWinMessage(multiplier)}
          
          {/* Show multiplier below */}
          <div className="text-3xl mt-2 text-center font-dynapuff" style={{
            color: multiplier >= 10 ? '#FFD700' : '#fbbf24',
          }}>
            {multiplier.toFixed(2)}x
          </div>
        </div>
      )}
      
      {/* Loss message */}
      {isWin === false && (
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-6xl font-dynapuff font-bold text-red-600"
          style={{ 
            textShadow: '0 0 10px rgba(255, 0, 0, 0.8), 0 0 20px rgba(255, 0, 0, 0.4)',
            animation: 'shake 0.5s ease-in-out',
            pointerEvents: 'none'
          }}
        >
          {getLossMessage()}
        </div>
      )}
      
      {/* CSS Animations */}
      <style jsx>{`
        @keyframes flash-animation {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        @keyframes scale-up {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        
        @keyframes mega-scale-up {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        
        @keyframes shake {
          0%, 100% { transform: translate(-50%, -50%); }
          20%, 60% { transform: translate(-48%, -50%); }
          40%, 80% { transform: translate(-52%, -50%); }
        }
      `}</style>
    </div>
  );
};

export default SellEffects;