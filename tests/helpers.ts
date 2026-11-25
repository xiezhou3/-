import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE automation_runs, automation_rules, external_event_tasks, external_events, project_integrations, recent_visits, saved_task_views, notifications, task_comment_attachments, task_comment_mentions, task_watchers, task_comments, workflow_transitions, workflow_statuses, task_labels, task_attachments, task_review_requests, task_assignees, task_work_logs, sprint_member_capacities, labels, resource_usages, api_tokens, user_ai_settings, task_dependencies, messages, conversations, project_comments, project_repositories, project_files, tasks, releases, sprints, milestones, projects, team_invitations, team_members, teams, users RESTART IDENTITY CASCADE`,
  );
}
