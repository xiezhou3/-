import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, UserRound } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getTaskReviewForAdmin } from "@/lib/task-review";
import { ReviewActions } from "./review-actions";

export default async function TaskReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { reviewId } = await params;
  if (!z.uuid().safeParse(reviewId).success) notFound();

  let data: Awaited<ReturnType<typeof getTaskReviewForAdmin>>;
  try {
    data = await getTaskReviewForAdmin(session.user.id, reviewId);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }

  const { review, task } = data;

  return (
    <main className="mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/invitations" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        返回消息中心
      </Link>

      <header className="space-y-2">
        <span className="ac-badge bg-medium-soft text-medium">待审核邮件</span>
        <h1 className="font-display text-2xl font-semibold text-ink">{task.title}</h1>
        <p className="text-sm text-ink-soft">
          {review.projectName ?? "项目"} · {review.submittedByName ?? "已注销用户"} 提交于{" "}
          {formatDate(review.submittedAt)}
        </p>
      </header>

      <section className="ac-card space-y-4 p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">任务说明</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">
            {task.description || "未填写任务描述。"}
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <h2 className="font-display text-base font-semibold text-ink">负责人</h2>
          <p className="mt-2 flex flex-wrap gap-2 text-sm text-ink-soft">
            {task.assignees.length > 0
              ? task.assignees.map((assignee) => (
                  <span key={assignee.id} className="inline-flex items-center gap-1">
                    <UserRound className="h-4 w-4" aria-hidden />
                    {assignee.name}
                  </span>
                ))
              : "未分配"}
          </p>
        </div>
      </section>

      <section className="ac-card space-y-3 p-5">
        <h2 className="font-display text-base font-semibold text-ink">交付文件链接</h2>
        <div className="space-y-2">
          {task.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-field border border-line px-3 py-2 text-sm text-primary hover:bg-primary-soft"
            >
              <span className="truncate">{attachment.name}</span>
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          ))}
        </div>
      </section>

      <section className="ac-card p-5">
        {review.status === "pending" ? (
          <ReviewActions reviewId={review.id} />
        ) : (
          <p className="text-sm text-ink-soft">该审核已经处理。</p>
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
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
