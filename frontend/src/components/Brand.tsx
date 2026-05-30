type SvgProps = React.SVGProps<SVGSVGElement>;

export function Starburst({ className, ...rest }: SvgProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className={className}
      {...rest}
    >
      <g>
        <line x1="32" y1="4" x2="32" y2="60" />
        <line x1="4" y1="32" x2="60" y2="32" />
        <line x1="12" y1="12" x2="52" y2="52" />
        <line x1="52" y1="12" x2="12" y2="52" />
        <circle cx="32" cy="4" r="1.6" fill="currentColor" />
        <circle cx="32" cy="60" r="1.6" fill="currentColor" />
        <circle cx="4" cy="32" r="1.6" fill="currentColor" />
        <circle cx="60" cy="32" r="1.6" fill="currentColor" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        <circle cx="52" cy="52" r="1.4" fill="currentColor" />
        <circle cx="52" cy="12" r="1.4" fill="currentColor" />
        <circle cx="12" cy="52" r="1.4" fill="currentColor" />
        <circle cx="32" cy="32" r="2.2" fill="currentColor" />
      </g>
    </svg>
  );
}

export function Boomerang({ className, ...rest }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className={className}
      {...rest}
    >
      <path d="M6 44 C 36 8, 84 8, 114 44" />
      <circle cx="114" cy="44" r="3" fill="currentColor" />
    </svg>
  );
}

export function DetMark({ className }: { className?: string }) {
  return (
    <div
      className={
        "relative inline-flex items-center justify-center " + (className ?? "")
      }
    >
      <Starburst className="absolute inset-0 h-full w-full text-[#d96c3a]/55 det-spin-slow" />
      <svg
        viewBox="0 0 40 40"
        className="relative z-10 h-3/5 w-3/5 text-[#1f2d33]"
        fill="currentColor"
      >
        {/* abstracted DET robot head */}
        <rect x="6" y="10" width="28" height="22" rx="6" />
        <rect x="11" y="16" width="6" height="6" rx="3" fill="#f3ecd6" />
        <rect x="23" y="16" width="6" height="6" rx="3" fill="#f3ecd6" />
        <rect x="14" y="25" width="12" height="2" rx="1" fill="#f3ecd6" />
        <rect x="18" y="4" width="4" height="6" rx="1.5" />
        <circle cx="20" cy="3" r="1.6" />
      </svg>
    </div>
  );
}

export function Diamond({ className, ...rest }: SvgProps) {
  return (
    <svg viewBox="0 0 24 40" fill="none" className={className} {...rest}>
      <path
        d="M12 1 L23 20 L12 39 L1 20 Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
