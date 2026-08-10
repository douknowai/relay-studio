import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import { AuthProvider } from '@/lib/auth-context';
import { ResourcePreconnect } from '@/components/resource-preconnect';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Relay Studio',
  description: 'AI 媒体生成工作台',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof performance==='undefined'||!performance.measure)return;var orig=performance.measure.bind(performance);performance.measure=function(n,s,e){try{if(typeof s==='object'&&s!==null){if(typeof s.start==='number'&&s.start<0)s.start=0;if(typeof s.end==='number'&&s.end<0)s.end=0;}else if(typeof s==='number'&&s<0){s=0;}if(typeof e==='number'&&e<0){e=0;}return orig(n,s,e);}catch(err){return undefined;}};})();`,
          }}
        />
        <ResourcePreconnect />
        <SupabaseConfigProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
