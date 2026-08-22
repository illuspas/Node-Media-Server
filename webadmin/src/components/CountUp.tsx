import { useEffect, useRef, useState } from "react";
import { fmtNum } from "../lib/format";

interface CountUpProps {
  value: number;
  format?: (v: number) => string;
}

/** Numeric text that eases from its current display value to the target value. */
export default function CountUp({ value, format = v => fmtNum(Math.round(v)) }: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    const t0 = performance.now();
    const dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * e;
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format(display)}</>;
}
