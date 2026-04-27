interface WAFlowLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
  theme?: 'dark' | 'light';
}

export function WAFlowLogo({ size = 'md', variant = 'full', theme = 'dark' }: WAFlowLogoProps) {
  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 52 : 38;
  const phoneSize = size === 'sm' ? 14 : size === 'lg' ? 26 : 20;
  const brandSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';
  const radius = size === 'sm' ? 'rounded-xl' : size === 'lg' ? 'rounded-2xl' : 'rounded-xl';

  const icon = (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${radius}`}
      style={{
        width: iconSize,
        height: iconSize,
        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
        boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
      }}
    >
      <svg width={phoneSize} height={phoneSize} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
          fill="white"
        />
        <path
          d="M9.2 7.8c-.18-.45-.6-.8-1.05-.8-.6 0-1.15.28-1.55.72C6.22 8.18 6 8.82 6 9.5c0 1.9 1.38 3.72 2.55 4.9 1.18 1.17 3 2.55 4.9 2.55.68 0 1.32-.22 1.78-.6.44-.4.72-.95.72-1.55 0-.45-.35-.87-.8-1.05l-1.5-.6c-.45-.18-.95 0-1.2.4l-.35.55c-.1.15-.28.2-.45.13C10.7 14.45 9.55 13.3 9.2 12.4c-.08-.17-.03-.35.13-.45l.55-.35c.4-.25.58-.75.4-1.2l-.6-1.5c-.02-.03-.04-.07-.06-.1z"
          fill="#25D366"
        />
      </svg>
    </div>
  );

  if (variant === 'icon') return icon;

  const waColor = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const flowColor = theme === 'dark' ? 'text-white/60' : 'text-gray-400';

  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className={`font-black tracking-tight ${brandSize}`}>
        <span className={waColor}>WA</span>
        <span className={flowColor}>Flow</span>
      </span>
    </div>
  );
}
