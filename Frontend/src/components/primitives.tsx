"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return <span className="chip">{children}{onRemove && <button aria-label={`Remove ${String(children)}`} onClick={onRemove}><X size={12} /></button>}</span>;
}
