import { getPool, query } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password";
import { currentBuildUser } from "@/lib/build-auth";

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
  partyId: string;
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
  if (!(await passwordMatches(password, rows[0].password_hash))) return null;
  await query("UPDATE build_users SET last_login_at = NOW() WHERE id = $1", [rows[0].id]);
  return { username: rows[0].username, name: rows[0].name };
}

/** True when the account still has a blank password (it can sign in with an empty password). */
export async function hasBlankPassword(username: string): Promise<boolean> {
  const rows = await query<{ blank: boolean }>(
    "SELECT (password_hash = '') AS blank FROM build_users WHERE lower(username) = lower($1) AND active LIMIT 1",
    [username.trim()]
  );
  return rows[0]?.blank === true;
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
  if (!(await passwordMatches(current, rows[0].password_hash))) return "wrong-current";
  const hash = await hashPassword(next);
  await query("UPDATE build_users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
  return "ok";
}

export type BuildUserRow = {
  id: string;
  username: string;
  name: string;
  role: BuildRole;
  mobile: string | null;
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type BuildRole = "admin" | "staff";
export type LiveBuildUser = { id: string; username: string; name: string; role: BuildRole; mobile: string | null };

/**
 * The signed-in BuildKhata user, checked against the database on every call: a user who was switched
 * off or deleted stops working at their next tap even if their cookie is still valid.
 */
export async function liveBuildUser(): Promise<LiveBuildUser | null> {
  const s = await currentBuildUser();
  if (!s) return null;
  try {
    const rows = await query<LiveBuildUser>(
      "SELECT id::text AS id, username, name, role, mobile FROM build_users WHERE lower(username) = lower($1) AND active LIMIT 1",
      [s.username]
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function countBuildUsers(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM build_users");
  return rows[0]?.n ?? 0;
}

const USERS_LOCK = 7770001;

/** Creates the very first user as admin. Only succeeds while the app has no users at all. */
export async function createFirstBuildUser(u: {
  username: string;
  name: string;
  mobile: string;
  password: string;
}): Promise<{ user: { username: string; name: string } } | { error: "not-first" | "taken" }> {
  const hash = await hashPassword(u.password);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [USERS_LOCK]);
    const c = await client.query("SELECT count(*)::int AS n FROM build_users");
    if (c.rows[0].n > 0) {
      await client.query("ROLLBACK");
      return { error: "not-first" };
    }
    const r = await client.query(
      "INSERT INTO build_users (username, name, mobile, password_hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING username, name",
      [u.username, u.name, u.mobile, hash]
    );
    await client.query("COMMIT");
    return { user: r.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string }).code === "23505") return { error: "taken" };
    throw err;
  } finally {
    client.release();
  }
}

/** Adds a user with a blank password. If the app has no active admin, the new user becomes the admin. */
export async function createBuildUser(u: {
  username: string;
  name: string;
  mobile: string | null;
  role: BuildRole;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [USERS_LOCK]);
    const a = await client.query("SELECT count(*)::int AS n FROM build_users WHERE role = 'admin' AND active");
    const role: BuildRole = a.rows[0].n === 0 ? "admin" : u.role;
    await client.query(
      "INSERT INTO build_users (username, name, mobile, password_hash, role) VALUES ($1,$2,$3,'',$4)",
      [u.username, u.name, u.mobile, role]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string }).code === "23505") return { error: "That username is already taken.", status: 409 };
    throw err;
  } finally {
    client.release();
  }
}

export type BuildUserPatch = { name?: string; mobile?: string; role?: BuildRole; active?: boolean; blankPassword?: boolean };

/** Edits a user. The last active admin can never be switched off or made staff. */
export async function updateBuildUser(
  id: string,
  p: BuildUserPatch
): Promise<{ ok: true } | { error: string; status: number }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [USERS_LOCK]);
    const t = await client.query("SELECT role, active, mobile FROM build_users WHERE id = $1", [id]);
    if (t.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "User not found.", status: 404 };
    }
    const cur = t.rows[0] as { role: BuildRole; active: boolean; mobile: string | null };
    const losesAdmin = cur.role === "admin" && cur.active && (p.active === false || p.role === "staff");
    if (losesAdmin) {
      const a = await client.query("SELECT count(*)::int AS n FROM build_users WHERE role = 'admin' AND active");
      if (a.rows[0].n <= 1) {
        await client.query("ROLLBACK");
        return { error: "At least one active admin is needed. Make someone else an admin first.", status: 400 };
      }
    }
    if (p.blankPassword && !(p.mobile ?? cur.mobile)) {
      await client.query("ROLLBACK");
      return { error: "Add a mobile number first. The forgot-password OTP goes there.", status: 400 };
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (p.name !== undefined) add("name", p.name);
    if (p.mobile !== undefined) add("mobile", p.mobile);
    if (p.role !== undefined) add("role", p.role);
    if (p.active !== undefined) add("active", p.active);
    if (p.blankPassword) add("password_hash", "");
    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return { error: "Nothing to change.", status: 400 };
    }
    vals.push(id);
    await client.query(`UPDATE build_users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const BUILD_USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

/** A blank stored password ("") matches only an empty password; otherwise the scrypt hash decides. */
async function passwordMatches(given: string, stored: string): Promise<boolean> {
  if (stored === "") return given === "";
  return verifyPassword(given, stored);
}

export async function listBuildUsers(): Promise<BuildUserRow[]> {
  return query<BuildUserRow>(
    `SELECT id::text AS id, username, name, role, mobile, active,
            (password_hash <> '') AS "hasPassword",
            last_login_at AS "lastLoginAt", created_at AS "createdAt"
     FROM build_users ORDER BY created_at ASC, id ASC`
  );
}

/** Account state used by the login screen: does it exist, is it active, is the password blank. */
export async function buildUserState(
  username: string
): Promise<{ id: string; username: string; name: string; mobile: string | null; active: boolean; passwordHash: string } | null> {
  const rows = await query<{
    id: string; username: string; name: string; mobile: string | null; active: boolean; password_hash: string;
  }>(
    "SELECT id::text AS id, username, name, mobile, active, password_hash FROM build_users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim()]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, username: r.username, name: r.name, mobile: r.mobile, active: r.active, passwordHash: r.password_hash };
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
  "id::text AS id, project_id::text AS \"projectId\", kind, COALESCE(category,'') AS category, amount::float8 AS amount, to_char(entry_date,'YYYY-MM-DD') AS date, COALESCE(party,'') AS party, COALESCE(party_id::text,'') AS \"partyId\", COALESCE(note,'') AS note, user_name AS \"user\"";

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
  partyId: string | null;
  note: string;
  user: string;
};

export async function createEntry(e: EntryInput): Promise<BuildEntry> {
  const rows = await query<BuildEntry>(
    `INSERT INTO build_entries (project_id, kind, category, amount, entry_date, party, party_id, note, user_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${ENTRY_COLS}`,
    [
      e.projectId,
      e.kind,
      e.category.slice(0, 60) || null,
      e.amount,
      e.date,
      e.party.slice(0, 120) || null,
      e.partyId,
      e.note.slice(0, 200) || null,
      e.user,
    ]
  );
  return rows[0];
}

/** Update the editable fields of an entry (kind/project stay fixed). */
export async function updateEntry(
  id: string,
  e: Pick<EntryInput, "category" | "amount" | "date" | "party" | "partyId" | "note">
): Promise<BuildEntry | null> {
  const rows = await query<BuildEntry>(
    `UPDATE build_entries SET category=$2, amount=$3, entry_date=$4, party=$5, party_id=$6, note=$7
     WHERE id=$1 RETURNING ${ENTRY_COLS}`,
    [id, e.category.slice(0, 60) || null, e.amount, e.date, e.party.slice(0, 120) || null, e.partyId, e.note.slice(0, 200) || null]
  );
  return rows[0] ?? null;
}

export async function deleteEntry(id: string): Promise<void> {
  await query("DELETE FROM build_entries WHERE id = $1", [id]);
}

export async function entryKind(id: string): Promise<BuildKind | null> {
  const rows = await query<{ kind: BuildKind }>("SELECT kind FROM build_entries WHERE id = $1", [id]);
  return rows[0]?.kind ?? null;
}

// ---------------------------------------------------------------------------
// Parties: suppliers (material) and labour names. Payments pick one, and the
// party's ledger is simply every entry that points at it.
// ---------------------------------------------------------------------------
export type BuildPartyKind = "SUP" | "LAB";
export type BuildParty = { id: string; kind: BuildPartyKind; name: string; phone: string; note: string; active: boolean };

const PARTY_COLS = "id::text AS id, kind, name, COALESCE(phone,'') AS phone, COALESCE(note,'') AS note, active";

export function isPartyKind(v: unknown): v is BuildPartyKind {
  return v === "SUP" || v === "LAB";
}

/** Which party list an entry type draws from: material -> suppliers, labour -> labour, payments received -> none. */
export function partyKindFor(kind: BuildKind): BuildPartyKind | null {
  return kind === "MAT" ? "SUP" : kind === "LAB" ? "LAB" : null;
}

export async function listParties(): Promise<BuildParty[]> {
  return query<BuildParty>(`SELECT ${PARTY_COLS} FROM build_parties ORDER BY lower(name)`);
}

/** Creates a party, or returns the one that already has that name (case-insensitive). */
export async function createParty(
  kind: BuildPartyKind,
  name: string,
  phone: string,
  note: string
): Promise<{ party: BuildParty; existed: boolean }> {
  const n = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const ph = phone.trim().slice(0, 30) || null;
  const nt = note.trim().slice(0, 200) || null;
  const ins = await query<BuildParty>(
    `INSERT INTO build_parties (kind, name, phone, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (kind, lower(name)) DO NOTHING RETURNING ${PARTY_COLS}`,
    [kind, n, ph, nt]
  );
  if (ins[0]) return { party: ins[0], existed: false };
  const ex = await query<BuildParty>(`SELECT ${PARTY_COLS} FROM build_parties WHERE kind = $1 AND lower(name) = lower($2)`, [kind, n]);
  return { party: ex[0], existed: true };
}

export async function updateParty(
  id: string,
  p: { name?: string; phone?: string; note?: string; active?: boolean }
): Promise<{ party: BuildParty } | { error: string; status: number }> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (p.name !== undefined) add("name", p.name.trim().replace(/\s+/g, " ").slice(0, 120));
  if (p.phone !== undefined) add("phone", p.phone.trim().slice(0, 30) || null);
  if (p.note !== undefined) add("note", p.note.trim().slice(0, 200) || null);
  if (p.active !== undefined) add("active", p.active);
  if (sets.length === 0) return { error: "Nothing to change.", status: 400 };
  vals.push(id);
  try {
    const rows = await query<BuildParty>(`UPDATE build_parties SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING ${PARTY_COLS}`, vals);
    if (!rows[0]) return { error: "Not found.", status: 404 };
    if (p.name !== undefined) await query("UPDATE build_entries SET party = $2 WHERE party_id = $1", [id, rows[0].name]);
    return { party: rows[0] };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "Another party already has that name.", status: 409 };
    throw err;
  }
}

/**
 * Works out the party for an entry. Material and labour entries point at a supplier / labour party
 * (given by id, or by typed name which is found or created). Payments received keep a plain text name.
 */
export async function resolveEntryParty(
  kind: BuildKind,
  partyId: string,
  partyText: string
): Promise<{ partyId: string | null; party: string } | { error: string }> {
  const pk = partyKindFor(kind);
  if (!pk) return { partyId: null, party: partyText.trim().slice(0, 120) };
  if (partyId) {
    const rows = await query<{ id: string; name: string; kind: BuildPartyKind }>(
      "SELECT id::text AS id, name, kind FROM build_parties WHERE id = $1",
      [partyId]
    );
    if (!rows[0] || rows[0].kind !== pk) return { error: "Pick a valid " + (pk === "SUP" ? "supplier" : "labour") + " name." };
    return { partyId: rows[0].id, party: rows[0].name };
  }
  if (partyText.trim()) {
    const { party } = await createParty(pk, partyText, "", "");
    return { partyId: party.id, party: party.name };
  }
  return { partyId: null, party: "" };
}
