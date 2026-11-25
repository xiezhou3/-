"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { approveTaskReview, rejectTaskReview } from "@/lib/task-review";

const reviewSchema = z.object({
  reviewId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500, "退回说明最长 500 字").optional(),
});

export type ReviewActionState = { error: string } | null;

export async function reviewTaskAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = reviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    if (parsed.data.decision === "approve") {
      await approveTaskReview(session.user.id, parsed.data.reviewId);
    } else {
      await rejectTaskReview(
        session.user.id,
        parsed.data.reviewId,
        parsed.data.note ?? "",
      );
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }

  revalidatePath("/invitations");
  revalidatePath("/projects", "layout");
  revalidatePath("/", "layout");
  redirect("/invitations?reviewed=1");
}
