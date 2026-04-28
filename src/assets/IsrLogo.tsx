type Props = { className?: string; size?: number };

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
        <linearGradient id="isr-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.65" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#isr-grad)" />
      <g fill="none" stroke="hsl(var(--background, 0 0% 100%))" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 18 V46" />
        <path d="M27 18 V46 M27 18 H38 a6 6 0 0 1 0 12 H27 M34 30 L42 46" />
        <path d="M48 22 a6 6 0 0 0 -6 -4 H? " />
      </g>
    </svg>
  );
}
