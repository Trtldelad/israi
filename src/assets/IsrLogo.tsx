type Props = { className?: string; size?: number };

// Abstract ISR monogram on a rounded tile.
export function IsrLogo({ className, size = 28 }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="isr-tile" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.78" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#isr-tile)" />
      {/* I  S  R rendered as inverted (background-colored) shapes */}
      <g fill="hsl(var(--background))">
        {/* I */}
        <rect x="13" y="20" width="4" height="24" rx="1.6" />
        {/* S */}
        <path d="M22 24 a4 4 0 0 1 4 -4 h7 a4 4 0 0 1 0 8 h-5 a4 4 0 0 0 0 8 h6 a4 4 0 0 0 4 -4 v-0.5 h-4 v0.5 a0 0 0 0 1 0 0 h-6 a0 0 0 0 1 0 0 v-0 a4 4 0 0 1 4 -4 h5 a4 4 0 0 0 0 -8 h-7 a4 4 0 0 0 -4 4 v0 z" opacity="0" />
        <path d="M22.5 26 a4 4 0 0 1 4 -4 h6.5 v3.5 h-6.5 a0.5 0.5 0 0 0 0 1 h4.5 a4 4 0 0 1 0 8 h-4.5 a0.5 0.5 0 0 0 0 1 h6.5 v3.5 h-6.5 a4 4 0 0 1 -4 -4 v-0.5 h3.5 v0.5 a0.5 0.5 0 0 0 0.5 0.5 h6.5 a0.5 0.5 0 0 0 0 -1 h-4.5 a4 4 0 0 1 0 -8 h4.5 a0.5 0.5 0 0 0 0 -1 h-6.5 a0.5 0.5 0 0 0 -0.5 0.5 v0 h-3.5 v0 z" />
        {/* R */}
        <path d="M42 20 h7 a6 6 0 0 1 4.2 10.3 l3.3 13.7 h-4.1 l-2.9 -12 h-3.5 v12 h-4 z M46 23.5 v6.5 h3 a3.25 3.25 0 0 0 0 -6.5 z" />
      </g>
    </svg>
  );
}
