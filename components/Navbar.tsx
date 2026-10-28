'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, homePathForRole } from '@/lib/useAuth';
import { UserRole } from '@/types';
import { useProfilePhoto } from '@/lib/documents';
import { PlanPill } from './Premium';
import { Crown, KeyRound, ChevronDown, LogOut, Menu, X, LayoutDashboard, UserCircle, Bell, CalendarClock, Mic, Calculator } from 'lucide-react';

interface NavLinkItem {
  href: string;
  label: string;
}

const LINKS: Record<'public' | UserRole, NavLinkItem[]> = {
  public: [
    { href: '/jobs', label: 'Find Jobs' },
    { href: '/institutes', label: 'Institutions' },
    { href: '/#how-it-works', label: 'How it works' },
    { href: '/premium', label: 'Plans' },
    { href: '/#for-institutions', label: 'For Institutions' },
    { href: '/about', label: 'About' },
  ],
  candidate: [
    { href: '/candidate/dashboard', label: 'Dashboard' },
    { href: '/jobs', label: 'Find Jobs' },
    { href: '/candidate/applications', label: 'Applications' },
    { href: '/candidate/tracker', label: 'Tracker' },
    { href: '/candidate/alerts', label: 'Alerts' },
    { href: '/candidate/profile', label: 'Profile' },
    { href: '/premium', label: 'Premium' },
  ],
  institute_admin: [
    { href: '/institute/dashboard', label: 'Dashboard' },
    { href: '/institute/ats', label: 'Applicants' },
    { href: '/institute/interviews', label: 'Interviews' },
    { href: '/institute/selection', label: 'Selection' },
    { href: '/institute/talent', label: 'Talent search' },
    { href: '/institute/reports', label: 'Reports' },
    { href: '/institute/post-job', label: 'Post a Vacancy' },
  ],
  recruiter: [
    { href: '/institute/dashboard', label: 'Dashboard' },
    { href: '/institute/ats', label: 'Applicants' },
    { href: '/institute/interviews', label: 'Interviews' },
    { href: '/institute/selection', label: 'Selection' },
    { href: '/institute/talent', label: 'Talent search' },
  ],
  super_admin: [
    { href: '/admin', label: 'Admin Console' },
    { href: '/scraper', label: 'Vacancy Import' },
    { href: '/jobs', label: 'Job Board' },
    { href: '/institutes', label: 'Institutions' },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  candidate: 'Faculty candidate',
  institute_admin: 'Institute administrator',
  recruiter: 'Recruiter',
  super_admin: 'Platform administrator',
};

/** AcadeXMatch symbol: candidate (white) and institution (gold) chevrons converging into an X, with the match point above. */
export function BrandMark({ inverted = false, className = 'w-9 h-9' }: { inverted?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill={inverted ? 'rgba(255,255,255,0.08)' : '#800000'} />
      <path d="M13 13 L22 24 L13 35" fill="none" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35 13 L26 24 L35 35" fill="none" stroke="#C6A15B" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="10.5" r="3" fill="#C6A15B" />
    </svg>
  );
}

export function BrandLogo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark inverted={inverted} className={`w-9 h-9 ${inverted ? 'ring-1 ring-white/20 rounded-xl' : ''}`} />
      <span className={`font-sans font-bold text-xl tracking-[-0.03em] ${inverted ? 'text-white' : 'text-brand-950'}`}>
        Acade<span className={inverted ? 'text-gold-300' : 'text-gold-500'}>X</span>Match
      </span>
    </span>
  );
}

function UserBadge({ userId, name }: { userId?: string; name: string }) {
  const photo = useProfilePhoto(userId);
  return photo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={photo} alt="" className="w-8 h-8 rounded-lg object-cover" />
    : <span className="w-8 h-8 rounded-lg bg-brand-900 text-white flex items-center justify-center text-xs font-semibold">{initials(name)}</span>;
}

function initials(name: string): string {
  const parts = name.replace(/^(dr|prof|mr|ms|mrs|shri)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleLogout = () => {
    StorageService.logout();
    router.push('/');
  };

  const links = user ? LINKS[user.role] : LINKS.public;
  const isActive = (href: string) => !href.includes('#') && (pathname === href || (href !== '/' && pathname?.startsWith(href + '/')));

  return (
    <header className="print:hidden sticky top-0 z-40 bg-ivory/90 backdrop-blur-md border-b border-slate-200/80 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Link href={user ? homePathForRole(user.role) : '/'} className="shrink-0" aria-label="AcadeXMatch home">
          <BrandLogo />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {links.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                isActive(item.href) ? 'text-brand-900 bg-brand-50' : 'text-brand-800/85 hover:text-brand-900 hover:bg-brand-50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {!ready ? (
            <div className="w-24 h-9" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition"
                aria-expanded={menuOpen}
              >
                <UserBadge userId={user.role === 'candidate' ? user.id : undefined} name={user.name} />
                <span className="hidden sm:block text-left">
                  <span className="block text-sm font-medium text-slate-900 max-w-[140px] truncate">{user.name}</span>
                  <span className="block text-xs text-slate-500 -mt-0.5">{ROLE_LABEL[user.role]}</span>
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50">
                  <div className="px-3 py-2.5 border-b border-slate-100 mb-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                    {user.role === 'candidate' && <div className="mt-1.5"><PlanPill user={user} /></div>}
                  </div>
                  <Link href={homePathForRole(user.role)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <LayoutDashboard className="w-4 h-4 text-slate-400" /> Dashboard
                  </Link>
                  {user.role === 'candidate' && (
                    <Link href="/candidate/profile" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      <UserCircle className="w-4 h-4 text-slate-400" /> Academic profile
                    </Link>
                  )}
                  {user.role === 'candidate' && (
                    <Link href="/candidate/alerts" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      <Bell className="w-4 h-4 text-slate-400" /> Job alerts
                    </Link>
                  )}
                  {user.role === 'candidate' && (
                    <Link href="/candidate/tracker" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      <CalendarClock className="w-4 h-4 text-slate-400" /> Deadlines &amp; tracker
                    </Link>
                  )}
                  <Link href="/account" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <KeyRound className="w-4 h-4 text-slate-400" /> My account
                  </Link>
                  {user.role === 'candidate' && (
                    <>
                      <Link href="/premium" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                        <Crown className="w-4 h-4 text-gold-500" /> Plans &amp; Premium
                      </Link>
                      <Link href="/candidate/interview-prep" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                        <Mic className="w-4 h-4 text-slate-400" /> Interview preparation
                      </Link>
                    </>
                  )}
                  <Link href="/salary-calculator" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <Calculator className="w-4 h-4 text-slate-400" /> Salary calculator
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-crimson-600 hover:bg-crimson-50">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition">
                Sign in
              </Link>
              <Link href="/register" className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold bg-brand-900 hover:bg-brand-800 text-white shadow-sm transition">
                Get started
              </Link>
            </>
          )}

          <button
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {links.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${isActive(item.href) ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {item.label}
            </Link>
          ))}
          {!user && (
            <Link href="/login" className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
