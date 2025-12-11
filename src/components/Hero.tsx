import { useEffect, useRef } from 'react';
import { createScope, splitText, createTimeline, stagger } from 'animejs';

interface Dot {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  vx: number;
  vy: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  strength: number;
  maxRadius: number;
}

export default function Hero() {
  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scope = useRef<ReturnType<typeof createScope> | null>(null);

  // Animation State - Ref to keep mutable state without re-renders
  const state = useRef({
    dots: [] as Dot[],
    ripples: [] as Ripple[],
    mouse: { x: -1000, y: -1000 }
  });

  useEffect(() => {
    // Text Animation (Anime.js)
    scope.current = createScope({ root }).add((self) => {
      const { words, chars } = splitText('p', {
        words: { wrap: 'clip' },
        chars: true,
      });

      createTimeline({
        loop: true,
        defaults: { ease: 'inOut(3)', duration: 1000 },
      })
        .add(
          words,
          {
            y: [
              ($el: HTMLElement) =>
                +(($el.dataset.line) || 0) % 2 ? '100%' : '-100%',
              '0%',
            ] as any,
          },
          stagger(125)
        )
        .add(
          chars,
          {
            y: (($el: HTMLElement) =>
              +(($el.dataset.line) || 0) % 2 ? '100%' : '-100%') as any,
          },
          stagger(10, { from: 'random' })
        );
    });

    return () => {
      scope.current?.revert();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const DOT_SPACING = 30; // Grid spacing
    const DOT_SIZE = 1.5;   // Dot radius
    const MOUSE_RADIUS = 150; // Influence area of mouse
    const RIPPLE_SPEED = 6;

    // Resize & Init
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      // Handle DPI
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Initialize Dots
      const dots: Dot[] = [];
      const cols = Math.ceil(width / DOT_SPACING);
      const rows = Math.ceil(height / DOT_SPACING);

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = i * DOT_SPACING;
          const y = j * DOT_SPACING;
          dots.push({
            x,
            y,
            baseX: x,
            baseY: y,
            size: DOT_SIZE,
            vx: 0,
            vy: 0
          });
        }
      }
      state.current.dots = dots;
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const { dots, ripples, mouse } = state.current;

      // Update Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        ripple.radius += RIPPLE_SPEED;
        ripple.strength *= 0.96; // Decay

        if (ripple.strength < 0.01) {
          ripples.splice(i, 1);
        }
      }

      // Draw Dots
      ctx.fillStyle = '#444'; // Default color

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        // Physics Accumulators
        let pushX = 0;
        let pushY = 0;
        let scale = 1;
        let alpha = 0.2; // Base opacity for "faint" dots

        // 1. Mouse Interaction (Subtle disturbance)
        const dx = mouse.x - dot.x;
        const dy = mouse.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_RADIUS) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          // Push away slightly
          const angle = Math.atan2(dy, dx);
          pushX += Math.cos(angle) * force * -10;
          pushY += Math.sin(angle) * force * -10;

          // Light up
          alpha = 0.2 + force * 0.5;
          scale = 1 + force * 0.5;
        }

        // 2. Ripple Interaction (Shockwave)
        for (const ripple of ripples) {
          const rx = dot.baseX - ripple.x;
          const ry = dot.baseY - ripple.y;
          const rDist = Math.sqrt(rx * rx + ry * ry);

          // Ring effect
          const ringWidth = 40;
          if (Math.abs(rDist - ripple.radius) < ringWidth) {
            // How close to the peak of the ring?
            const force = (1 - Math.abs(rDist - ripple.radius) / ringWidth) * ripple.strength;

            // Displacement direction (away from center)
            const dirX = rx / rDist;
            const dirY = ry / rDist;

            // Strong push
            pushX += dirX * force * 40;
            pushY += dirY * force * 40;

            scale += force * 2;
            alpha += force;
          }
        }

        // Physics Integration (Spring System to restore position)
        // Hooke's Law: F = -k * displacement
        const targetX = dot.baseX + pushX;
        const targetY = dot.baseY + pushY;

        dot.vx += (targetX - dot.x) * 0.1; // Spring stiffness
        dot.vy += (targetY - dot.y) * 0.1;

        dot.vx *= 0.8; // Friction/Damping
        dot.vy *= 0.8;

        dot.x += dot.vx;
        dot.y += dot.vy;

        // Draw
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size * scale, 0, Math.PI * 2);

        // Color mixing
        // If high energy (alpha > threshold), tint it Cyan
        if (alpha > 0.4) {
          const intensity = Math.min(alpha, 1);
          // Mix between grey and cyan based on intensity
          // #08CCD9 is roughly 8, 204, 217
          ctx.fillStyle = `rgba(8, 204, 217, ${intensity})`;
        } else {
          ctx.fillStyle = `rgba(100, 100, 100, ${alpha})`;
        }

        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = root.current?.getBoundingClientRect();
    if (rect) {
      state.current.mouse = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const rect = root.current?.getBoundingClientRect();
    if (rect) {
      state.current.ripples.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        radius: 0,
        maxRadius: 1500,
        strength: 1
      });
    }
  };

  const handleMouseLeave = () => {
    state.current.mouse = { x: -1000, y: -1000 };
  };

  return (
    <div
      ref={root}
      className="relative w-screen h-screen flex justify-center items-center overflow-hidden bg-[#0a0a0a]"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        style={{ touchAction: 'none' }}
      />

      <div className="relative z-10 pointer-events-none select-none">
        <p className="font-mono text-target text-4xl font-semibold text-cyan leading-tight text-center">
          Hello! <span className='text-lime'>Supeem</span> here.<br />
          いらっしゃいませ
        </p>
      </div>
    </div>
  );
}