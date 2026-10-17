import './Loader.css';

interface LoaderProps {
  size?: number;
  label?: string;
  /** The blue ELUM loader, for account and sign-in screens. Otherwise the Write loader. */
  brand?: boolean;
}

/** Breathing lens loader. People who prefer reduced motion see a still mark instead. */
export function Loader({ size = 40, label = 'Loading', brand = false }: LoaderProps) {
  const src = brand ? '/brand/motion/elum-loader.svg' : '/brand/motion/elum-loader-write.svg';
  const still = brand ? '/brand/logos/elum-mark.svg' : '/brand/write/elum-write-mark-flat.svg';
  return (
    <span className="loader" role="status" style={{ width: size, height: size }}>
      <img className="loader__anim" src={src} width={size} height={size} alt="" />
      <img className="loader__still" src={still} width={size} height={size} alt="" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function FullPageLoader({ brand = false, label }: { brand?: boolean; label?: string }) {
  return (
    <div className="full-page-loader">
      <Loader size={48} brand={brand} label={label} />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}
