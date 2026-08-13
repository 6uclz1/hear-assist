import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
);

export const MicrophoneIcon = (props: IconProps) => <Icon {...props}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></Icon>;
export const StopIcon = (props: IconProps) => <Icon {...props}><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" /></Icon>;
export const SettingsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></Icon>;
export const ExpandIcon = (props: IconProps) => <Icon {...props}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></Icon>;
export const CollapseIcon = (props: IconProps) => <Icon {...props}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></Icon>;
export const TrashIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h16M9 7V4h6v3M18 7l-1 14H7L6 7M10 11v6M14 11v6" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="m7 10 5 5 5-5" /></Icon>;
export const MinusIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14" /></Icon>;
export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>;
export const AlertIcon = (props: IconProps) => <Icon {...props}><path d="M12 3 2.7 20h18.6L12 3Z" /><path d="M12 9v4M12 17h.01" /></Icon>;

export const HearAssistLogo = (props: IconProps) => (
  <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" {...props}>
    <rect width="48" height="48" rx="13" fill="url(#hear-assist-gradient)" />
    <path fill="#fff" d="M9.5 10h29A4.5 4.5 0 0 1 43 14.5v19a4.5 4.5 0 0 1-4.5 4.5H25l-8.2 5c-1 .6-2.3-.1-2.3-1.3V38h-5A4.5 4.5 0 0 1 5 33.5v-19A4.5 4.5 0 0 1 9.5 10Z" />
    <g fill="#0864C7"><rect x="10" y="20" width="3" height="7" rx="1.5" /><rect x="15" y="16" width="3" height="15" rx="1.5" /><rect x="20" y="18" width="3" height="11" rx="1.5" /><rect x="25" y="14" width="3" height="19" rx="1.5" /><rect x="30" y="17" width="3" height="13" rx="1.5" /><rect x="35" y="20" width="3" height="7" rx="1.5" /></g>
    <path stroke="#BDDDFB" strokeWidth="2" strokeLinecap="round" d="M11 34h26M11 37h17" />
    <defs><linearGradient id="hear-assist-gradient" x1="5" y1="3" x2="43" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#1687ED" /><stop offset="1" stopColor="#0750AE" /></linearGradient></defs>
  </svg>
);
