'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => { let t: string | null = null; try { t = localStorage.getItem('theme'); } catch {} setTheme(t ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); }, []);
  const toggle = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); document.documentElement.setAttribute('data-theme', next); try { localStorage.setItem('theme', next); } catch {} };
  return <button type="button" onClick={toggle} className="rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>;
}
export const themeInitScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
