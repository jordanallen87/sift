import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's standard classname helper: merges conditional class lists via `clsx`, then resolves conflicting Tailwind utilities (e.g. two different `bg-*` classes) via `tailwind-merge` so the last one wins predictably. Every component under `src/components/ui/` depends on this exact export. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
