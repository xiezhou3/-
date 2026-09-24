import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE task_labels, labels, resource_usages, api_tokens, task_dependencies, messages, conversations, project_comments, project_files, tasks, milestones, projects, team_invitations, team_members, teams, users RESTART IDENTITY CASCADE`,
  );
}
