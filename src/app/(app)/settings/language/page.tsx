import { Globe2 } from "lucide-react";

export default function LanguagePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold text-ink">语言</h1>
        <p className="text-sm text-ink-soft">选择平台界面使用的语言。</p>
      </header>

      <section className="ac-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-field bg-primary-soft text-primary">
            <Globe2 className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-ink">界面语言</h2>
              <span className="ac-badge bg-primary-soft text-primary">简体中文</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">当前整个平台使用简体中文。</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium text-ink">English</p>
            <p className="mt-0.5 text-xs text-ink-faint">英文界面暂未开放</p>
          </div>
          <button type="button" disabled className="ac-btn-ghost">
            暂不可用
          </button>
        </div>
      </section>
    </div>
  );
}
