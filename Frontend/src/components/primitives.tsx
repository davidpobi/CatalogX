"use client";

import { X } from "lucide-react";
import { useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";

const subscribeToHydration = () => () => undefined;
const hydratedSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export function Button({ className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const hydrated = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverHydrationSnapshot);
  return <button className={`button ${className}`} disabled={hydrated ? disabled : undefined} {...props} />;
}

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return <span className="chip">{children}{onRemove && <button aria-label={`Remove ${String(children)}`} onClick={onRemove}><X size={12} /></button>}</span>;
}
