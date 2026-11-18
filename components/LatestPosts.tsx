'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import BlogCard from '@/components/BlogCard';
import { Reveal } from '@/components/HomeMotion';
import type { PostCard } from '@/lib/blog';

/** Home page: the three newest blog posts / white papers. Hidden until the first post is published. */
export default function LatestPosts() {
  const [posts, setPosts] = useState<PostCard[]>([]);
  useEffect(() => {
    fetch('/api/blog?limit=3').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.posts) setPosts(d.posts); }).catch(() => undefined);
  }, []);
  if (!posts.length) return null;
  return (
    <section aria-labelledby="latest-posts" className="max-w-7xl mx-auto px-4 sm:px-8 py-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] flex items-center gap-2 text-brand-700"><span className="gold-rule" /><BookOpen className="w-4 h-4" aria-hidden="true" /> Insights</p>
          <h2 id="latest-posts" className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">Latest articles &amp; white papers</h2>
        </div>
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline">Visit the blog <ArrowRight className="w-4 h-4" /></Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((p, i) => <Reveal key={p.id} delay={i * 90} className="flex"><div className="w-full"><BlogCard p={p} /></div></Reveal>)}
      </div>
    </section>
  );
}
