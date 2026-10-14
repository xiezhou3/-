import Link from "next/link";
import { ArrowRight, Clock, Mail, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listMyInvitations } from "@/lib/invitation";
import { listPendingTaskReviewsForAdmin } from "@/lib/task-review";
import { InvitationActions } from "./invitation-actions";

export default async function InvitationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const invitations = await listMyInvitations(session.user.id);
  const reviews = await listPendingTaskReviewsForAdmin(session.user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <p className="text-sm text-ink-soft">平台消息</p>
        <h1 className="font-display text-2xl font-semibold text-ink">消息中心</h1>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">任务审核</h2>
        {reviews.length === 0 ? (
          <div className="ac-card flex items-center gap-3 p-5 text-sm text-ink-soft">
            <Mail className="h-5 w-5 text-ink-faint" aria-hidden />
            暂无待审核任务。
          </div>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="ac-card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink">
                      {review.taskTitle}
                    </h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      {review.projectName} · {review.submittedByName ?? "已注销用户"} 提交
                    </p>
                  </div>
                  <span className="ac-badge bg-medium-soft text-medium">待审核</span>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {formatDateTime(review.submittedAt)} · {review.attachmentsCount} 个文件链接
                </p>
                <Link
                  href={`/reviews/${review.id}`}
                  className="ac-btn inline-flex text-sm"
                >
                  打开审核
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">团队邀请</h2>
      {invitations.length === 0 ? (
        <div className="ac-card flex items-center gap-3 p-6 text-sm text-ink-soft">
          <Mail className="h-5 w-5 text-ink-faint" aria-hidden />
          暂无待处理邀请。
        </div>
      ) : (
        <ul className="space-y-3">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="ac-card space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {invitation.teamName}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                    <UserRound className="h-4 w-4" aria-hidden />
                    {invitation.invitedByName} 邀请你加入
                  </p>
                </div>
                <span className="ac-badge bg-primary-soft text-primary">待接受</span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {formatDate(invitation.createdAt)} 发送 · {daysLeft(invitation.expiresAt)} 天后到期
              </p>
              <InvitationActions invitationId={invitation.id} />
            </li>
          ))}
        </ul>
      )}
      </section>
    </main>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysLeft(expiresAt: Date) {
  return Math.max(
    0,
    Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
