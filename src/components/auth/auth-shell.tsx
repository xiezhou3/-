import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#17362f] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <div className="relative">
          <Link href="/login" className="inline-flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-white font-display text-lg font-bold text-[#17362f]">
              A
            </span>
            <span>
              <span className="block font-display text-xl font-semibold">
                AgileCampus
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                Campus delivery workspace
              </span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-medium text-white/75">
            <Sparkles className="h-3.5 w-3.5 text-[#f3b67f]" aria-hidden />
            清晰协作，稳步交付
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight xl:text-5xl">
            让团队把注意力
            <br />
            放回真正重要的工作。
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/65">
            从项目计划、任务协作到资料沉淀，在一个连续的工作区里推进。
          </p>
        </div>

        <div className="relative flex items-center gap-3 text-[11px] text-white/45">
          <span className="h-px w-12 bg-white/20" />
          AgileCampus workspace
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/login" className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-primary font-display text-base font-bold text-white">
                A
              </span>
              <span className="font-display text-lg font-semibold text-ink">
                AgileCampus
              </span>
            </Link>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Workspace
            </span>
          </div>

          <div className="mb-7">
            <h2 className="font-display text-3xl font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
          </div>

          {children}

          <div className="mt-7 border-t border-line pt-5 text-sm text-ink-soft">
            {footer}
          </div>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            返回工作区
          </Link>
        </div>
      </section>
    </main>
  );
}
