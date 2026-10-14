import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE task_labels, labels, resource_usages, api_tokens, user_ai_settings, task_dependencies, messages, conversations, project_comments, project_files, project_repositories, tasks, milestones, projects, team_invitations, team_members, teams, users RESTART IDENTITY CASCADE`,
  );
}
