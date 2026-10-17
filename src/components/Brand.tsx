/** Logos from the ELUM brand kit, swapped for the reversed set on dark grounds. */

export function WriteLockup({ height = 28 }: { height?: number }) {
  // The lockup's viewBox is 358 x 104.
  const width = Math.round((height * 358) / 104);
  return (
    <span className="brand-lockup" style={{ height }}>
      <img className="theme-light-only" src="/brand/write/elum-write-lockup.svg" width={width} height={height} alt="ELUM Write" />
      <img className="theme-dark-only" src="/brand/write/elum-write-lockup-reversed.svg" width={width} height={height} alt="ELUM Write" />
    </span>
  );
}

export function WriteMark({ size = 32 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ height: size }}>
      <img className="theme-light-only" src="/brand/write/elum-write-mark.svg" width={size} height={size} alt="" />
      <img className="theme-dark-only" src="/brand/write/elum-write-mark-reversed.svg" width={size} height={size} alt="" />
    </span>
  );
}

/** The logo for a single Write document. */
export function DocIcon({ size = 24, label }: { size?: number; label?: string }) {
  const width = Math.round((size * 48) / 60);
  const alt = label ?? '';
  return (
    <span className="doc-icon" style={{ height: size, width }} aria-hidden={label ? undefined : true}>
      <img className="theme-light-only" src="/brand/write/elum-write-doc.svg" width={width} height={size} alt={alt} />
      <img className="theme-dark-only" src="/brand/write/elum-write-doc-reversed.svg" width={width} height={size} alt={alt} />
    </span>
  );
}

export function ElumLockup({ height = 20 }: { height?: number }) {
  return (
    <span className="brand-lockup" style={{ height }}>
      <img className="theme-light-only" src="/brand/logos/elum-lockup-horizontal.svg" height={height} alt="ELUM" />
      <img className="theme-dark-only" src="/brand/logos/elum-lockup-horizontal-reversed.svg" height={height} alt="ELUM" />
    </span>
  );
}
