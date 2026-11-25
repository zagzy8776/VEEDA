import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { animate, useMotionValue, useMotionValueEvent } from 'motion/react';
import { DURATION, EASE_OUT } from '../motion';

interface AnimatedNumberProps {
  value: number;
  /** Digits after the decimal point. */
  decimals?: number;
  /** Thousands separators (8,432) instead of a bare 8432. */
  group?: boolean;
  prefix?: string;
  suffix?: string;
  /** Count up from zero on first render — an instrument booting. */
  boot?: boolean;
  duration?: number;
  /** Shown when `value` is not a finite number, i.e. no reading yet. */
  fallback?: string;
  style?: CSSProperties;
}

/**
 * A number that animates whenever `value` changes.
 *
 * The formatted text is written straight to the DOM node from a MotionValue, so
 * motion never re-renders React per frame — which matters on a phone WebView.
 * Colour, size and font stay with the caller through `style`.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  group = false,
  prefix = '',
  suffix = '',
  boot = false,
  duration = DURATION.slow,
  fallback = '--',
  style,
}: AnimatedNumberProps) {
  const hasValue = Number.isFinite(value);
  // `boot` starts the count at zero; otherwise the first paint is already right
  // and only later updates animate.
  const count = useMotionValue(boot && hasValue ? 0 : hasValue ? value : 0);
  const ref = useRef<HTMLSpanElement>(null);

  const format = useCallback((n: number) => {
    const text = group
      ? n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : n.toFixed(decimals);
    return `${prefix}${text}${suffix}`;
  }, [decimals, group, prefix, suffix]);

  useMotionValueEvent(count, 'change', latest => {
    if (ref.current && hasValue) ref.current.textContent = format(latest);
  });

  useEffect(() => {
    if (!hasValue) return;
    const controls = animate(count, value, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [count, value, duration, hasValue]);

  return <span ref={ref} style={style}>{hasValue ? format(boot ? 0 : value) : fallback}</span>;
}
