import { useEffect, useRef, useState } from 'react';

function parseViewBox(value: string): [number, number, number, number] {
  const [x, y, width, height] = value.split(/[\s,]+/).map(Number);
  return [x, y, width, height];
}

function formatViewBox(values: [number, number, number, number]): string {
  return values.map((value) => value.toFixed(2)).join(' ');
}

export function useAnimatedViewBox(target: string, duration = 520) {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = parseViewBox(currentRef.current);
    const to = parseViewBox(target);
    if (from.every((value, index) => Math.abs(value - to[index]) < 0.08)) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next: [number, number, number, number] = [
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased,
        from[2] + (to[2] - from[2]) * eased,
        from[3] + (to[3] - from[3]) * eased,
      ];
      const formatted = formatViewBox(next);
      currentRef.current = formatted;
      setCurrent(formatted);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = target;
        setCurrent(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [duration, target]);

  return current;
}
