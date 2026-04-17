import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function BaseIcon(props: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function DashboardIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" />
    </BaseIcon>
  );
}

export function UsersIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M16 21v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="8" r="3" />
      <path d="M21 21v-1a4 4 0 0 0-3-3.9" />
      <path d="M15 4.3a3 3 0 0 1 0 5.8" />
    </BaseIcon>
  );
}

export function BoxIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M12 2 3 7l9 5 9-5-9-5Z" />
      <path d="M3 7v10l9 5 9-5V7" />
      <path d="M12 12v10" />
    </BaseIcon>
  );
}

export function WarehouseIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M3 22h18" />
      <path d="M5 22V8l7-4 7 4v14" />
      <path d="M9 22v-6h6v6" />
    </BaseIcon>
  );
}

export function InventoryIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16v13H4z" />
      <path d="M9 7V4h6v3" />
      <path d="M8 12h8M8 16h6" />
    </BaseIcon>
  );
}

export function PurchasingIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2l2.2 10.5h10.7L21 8H8" />
    </BaseIcon>
  );
}

export function SalesIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 19h16" />
      <path d="M6 16V8l6-4 6 4v8" />
      <path d="M9 13h6" />
      <path d="M12 10v6" />
    </BaseIcon>
  );
}

export function ProductionIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M14 3h7v7" />
      <path d="m10 14 11-11" />
      <path d="M7 4 3 8l4 4" />
      <path d="m3 8 9 9" />
      <path d="m12 17 4 4 4-4" />
    </BaseIcon>
  );
}

export function AuditIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </BaseIcon>
  );
}

export function SunIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </BaseIcon>
  );
}

export function MoonIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </BaseIcon>
  );
}

export function ArrowDownIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4v14" />
      <path d="m6 12 6 6 6-6" />
    </BaseIcon>
  );
}

export function ArrowUpIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M12 20V6" />
      <path d="m6 12 6-6 6 6" />
    </BaseIcon>
  );
}

export function SwapIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 8h14l-3-3" />
      <path d="m18 8-3 3" />
      <path d="M20 16H6l3 3" />
      <path d="m6 16 3-3" />
    </BaseIcon>
  );
}

export function MenuIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </BaseIcon>
  );
}

export function CloseIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </BaseIcon>
  );
}

export function PanelOpenIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M10 4v16" />
      <path d="m14 12 3-3" />
      <path d="m14 12 3 3" />
    </BaseIcon>
  );
}

export function PanelCloseIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M10 4v16" />
      <path d="m16 12-3-3" />
      <path d="m16 12-3 3" />
    </BaseIcon>
  );
}

export function UserCircleIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <circle cx="12" cy="12" r="10" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: Props) {
  return (
    <BaseIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </BaseIcon>
  );
}
