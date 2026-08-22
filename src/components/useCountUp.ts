import { useEffect, useRef, useState } from "react";

/** 数字滚动动画；尊重减少动态偏好 */
export default function useCountUp(target: number, duration = 650): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVal(target); fromRef.current = target; return; }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return Math.round(val * 10) / 10;
}
