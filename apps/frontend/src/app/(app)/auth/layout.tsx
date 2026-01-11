import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import Image from 'next/image';
import loadDynamic from 'next/dynamic';
import { TestimonialComponent } from '@gitroom/frontend/components/auth/testimonial.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <div className="bg-[#05051e] flex flex-col min-h-screen w-screen text-white relative overflow-hidden">
      {/* Background Effects */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #05051e 100%)',
        }}
      />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />

      <ReturnUrlComponent />

      {/* Main Content Area - Centered */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 relative">
        <div className="w-full max-w-[520px] bg-[#1A1919]/80 backdrop-blur-xl border border-[#ffffff10] shadow-2xl rounded-[24px] p-8 md:p-12 transition-all duration-500 hover:border-[#ffffff20]">
          <div className="w-full flex flex-col gap-8">
            <div className="flex justify-center transform scale-110 mb-2">
              <LogoTextComponent />
            </div>
            <div className="flex w-full">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
