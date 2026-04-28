import logoSrc from "./isr-logo.png";

type Props = { className?: string; size?: number };

// Polished ISR monogram logo.
export function IsrLogo({ className, size = 28 }: Props) {
  return (
    <img
      src={logoSrc}
      width={size}
      height={size}
      className={className}
      alt="ISR"
      loading="lazy"
      decoding="async"
      style={{ objectFit: "contain" }}
    />
  );
}
