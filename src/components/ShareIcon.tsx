/**
 * The ELUM share symbol: two discs, you and the person you share with. Their overlap, the part
 * you share, is lit, and the dot is the invitation on its way. Drawn in currentColor so it sits in
 * any button, like the other line icons.
 */
export function ShareIcon({ size = 16, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg className="share-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="13" r="6" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="14.5" cy="13" r="6" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M11.5 7.8A6 6 0 0 1 11.5 18.2A6 6 0 0 1 11.5 7.8Z" fill="currentColor" />
      <circle cx="20.4" cy="4.6" r="1.9" fill="currentColor" />
    </svg>
  );
}
