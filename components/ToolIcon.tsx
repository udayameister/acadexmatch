import React from 'react';
import { BadgeCheck, BookOpenCheck, CalendarRange, GraduationCap, Grid3x3, IndianRupee, Layers, ListChecks, Quote, TrendingUp, Wrench } from 'lucide-react';

const ICONS = { BadgeCheck, BookOpenCheck, CalendarRange, GraduationCap, Grid3x3, IndianRupee, Layers, ListChecks, Quote, TrendingUp };
export default function ToolIcon({ name, className }: { name: string; className?: string }) {
  const I = (ICONS as Record<string, typeof Wrench>)[name] || Wrench;
  return <I className={className} aria-hidden="true" />;
}
