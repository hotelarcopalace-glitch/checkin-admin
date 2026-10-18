import { query } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password";

// Data layer for BuildKhata. All money is returned as a JS number, ids as
// strings, dates as "YYYY-MM-DD" — so the client never deals with pg's raw
// NUMERIC-as-string or Date objects.

export type BuildProject = { id: string; name: string; client: string; value: number | null };
export type BuildKind = "IN" | "MAT" | "LAB";
export type BuildEntry = {
  id: string;
  projectId: string;
  kind: BuildKind;
  category: string;
  amount: number;
  date: string;
  party: string;
  note: string;
  user: string;
};

export function isKind(v: unknown): v is BuildKind {
  return v === "IN" || v === "MAT" || v === "LAB";
}

/** Verify a BuildKhata login. Returns {username, name} or null. */
export async function verifyBuildUser(
  username: string,
  password: string
): Promise<{ username: string; name: string } | null> {
  const rows = await query<{ id: string; username: string; name: string; password_hash: string }>(
    "SELECT id::text AS id, username, name, password_hash FROM build_users WHERE lower(username) = lower($1) AND active LIMIT 1",
    [username.trim()]
  );
  if (rows.length === 0) return null;
  const ok = await verifyPassword(password, rows[0].password_hash);
  if (!ok) return null;
  await query("UPDATE build_users SET last_login_at = NOW() WHERE id = $1", [rows[0].id]);
  return { username: rows[0].username, name: rows[0].name };
}

/** A user changes their own password (verifies the current one first). */
export async function changeBuildPassword(
  username: string,
  current: string,
  next: string
): Promise<"ok" | "not-found" | "wrong-current"> {
  const rows = await query<{ id: string; password_hash: string }>(
    "SELECT id::text AS id, password_hash FROM build_users WHERE lower(username) = lower($1) AND active LIMIT 1",
    [username.trim()]
  );
  if (rows.length === 0) return "not-found";
  const ok = await verifyPassword(current, rows[0].password_hash);
  if (!ok) return "wrong-current";
  const hash = await hashPassword(next);
  await query("UPDATE build_users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
  return "ok";
}

const PROJECT_COLS = "id::text AS id, name, COALESCE(client,'') AS client, estimated_value::float8 AS value";
// Same shape before db-setup has added estimated_value, so projects still load meanwhile.
const PROJECT_COLS_OLD = "id::text AS id, name, COALESCE(client,'') AS client, NULL::float8 AS value";
const noValueColumn = (err: unknown) => (err as { code?: string }).code === "42703";

export async function listProjects(): Promise<BuildProject[]> {
  const sql = (cols: string) => `SELECT ${cols} FROM build_projects WHERE NOT archived ORDER BY created_at ASC`;
  try {
    return await query<BuildProject>(sql(PROJECT_COLS));
  } catch (err) {
    if (!noValueColumn(err)) throw err;
    return query<BuildProject>(sql(PROJECT_COLS_OLD));
  }
}

export async function createProject(name: string, client: string, value: number | null): Promise<BuildProject> {
  const n = name.trim().slice(0, 120);
  const c = client.trim().slice(0, 120) || null;
  try {
    const rows = await query<BuildProject>(
      `INSERT INTO build_projects (name, client, estimated_value) VALUES ($1, $2, $3) RETURNING ${PROJECT_COLS}`,
      [n, c, value]
    );
    return rows[0];
  } catch (err) {
    if (!noValueColumn(err)) throw err;
    const rows = await query<BuildProject>(
      `INSERT INTO build_projects (name, client) VALUES ($1, $2) RETURNING ${PROJECT_COLS_OLD}`,
      [n, c]
    );
    return rows[0];
  }
}

export async function updateProject(id: string, name: string, client: string, value: number | null): Promise<BuildProject | null> {
  const n = name.trim().slice(0, 120);
  const c = client.trim().slice(0, 120) || null;
  try {
    const rows = await query<BuildProject>(
      `UPDATE build_projects SET name=$2, client=$3, estimated_value=$4 WHERE id=$1 RETURNING ${PROJECT_COLS}`,
      [id, n, c, value]
    );
    return rows[0] ?? null;
  } catch (err) {
    if (!noValueColumn(err)) throw err;
    const rows = await query<BuildProject>(
      `UPDATE build_projects SET name=$2, client=$3 WHERE id=$1 RETURNING ${PROJECT_COLS_OLD}`,
      [id, n, c]
    );
    return rows[0] ?? null;
  }
}

// Hard delete — build_entries has ON DELETE CASCADE, so the project's entries
// go with it. The UI confirms (and states the entry count) before calling this.
export async function deleteProject(id: string): Promise<void> {
  await query("DELETE FROM build_projects WHERE id = $1", [id]);
}

const ENTRY_COLS =
  "id::text AS id, project_id::text AS \"projectId\", kind, COALESCE(category,'') AS category, amount::float8 AS amount, to_char(entry_date,'YYYY-MM-DD') AS date, COALESCE(party,'') AS party, COALESCE(note,'') AS note, user_name AS \"user\"";

export async function listEntries(): Promise<BuildEntry[]> {
  return query<BuildEntry>(
    `SELECT ${ENTRY_COLS} FROM build_entries ORDER BY entry_date DESC, id DESC`
  );
}

export type EntryInput = {
  projectId: string;
  kind: BuildKind;
  category: string;
  amount: number;
  date: string;
  party: string;
  note: string;
  user: string;
};

export async function createEntry(e: EntryInput): Promise<BuildEntry> {
  const rows = await query<BuildEntry>(
    `INSERT INTO build_entries (project_id, kind, category, amount, entry_date, party, note, user_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${ENTRY_COLS}`,
    [
      e.projectId,
      e.kind,
      e.category.slice(0, 60) || null,
      e.amount,
      e.date,
      e.party.slice(0, 120) || null,
      e.note.slice(0, 200) || null,
      e.user,
    ]
  );
  return rows[0];
}

/** Update the editable fields of an entry (kind/project stay fixed). */
export async function updateEntry(
  id: string,
  e: Pick<EntryInput, "category" | "amount" | "date" | "party" | "note">
): Promise<BuildEntry | null> {
  const rows = await query<BuildEntry>(
    `UPDATE build_entries SET category=$2, amount=$3, entry_date=$4, party=$5, note=$6
     WHERE id=$1 RETURNING ${ENTRY_COLS}`,
    [id, e.category.slice(0, 60) || null, e.amount, e.date, e.party.slice(0, 120) || null, e.note.slice(0, 200) || null]
  );
  return rows[0] ?? null;
}

export async function deleteEntry(id: string): Promise<void> {
  await query("DELETE FROM build_entries WHERE id = $1", [id]);
}
