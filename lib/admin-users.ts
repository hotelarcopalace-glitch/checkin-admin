import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

// Admin users created inside the panel. The env ADMIN_USERNAME /
// ADMIN_PASSWORD_HASH login stays as a bootstrap / recovery account and is
// never stored here.

export type AdminUser = {
  id: string;
  username: string;
  sms_tag: string | null;
  created_at: string;
  last_login_at: string | null;
};

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function validUsername(u: unknown): u is string {
  return typeof u === "string" && USERNAME_RE.test(u.trim());
}

export function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 6 && p.length <= 200;
}

// A hotel tag must be a real "@Name…" of at least 12 chars — otherwise the
// account is treated as a full admin (empty tag). Blank clears it.
export function cleanTag(t: unknown): string | null {
  const s = typeof t === "string" ? t.trim() : "";
  if (!s) return null;
  return s.length >= 12 ? s.slice(0, 60) : null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  return query<AdminUser>(
    "SELECT id::text AS id, username, sms_tag, created_at, last_login_at FROM admin_users ORDER BY username ASC"
  );
}

export async function adminUserExists(username: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM admin_users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim()]
  );
  return rows.length > 0;
}

export async function createAdminUser(
  username: string,
  password: string,
  tag?: string | null
): Promise<void> {
  const hash = await hashPassword(password);
  await query("INSERT INTO admin_users (username, password_hash, sms_tag) VALUES ($1, $2, $3)", [
    username.trim(),
    hash,
    cleanTag(tag ?? null),
  ]);
}

export async function setAdminUserTag(id: string, tag: string | null): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "UPDATE admin_users SET sms_tag = $1 WHERE id = $2 RETURNING id",
    [cleanTag(tag), id]
  );
  return rows.length > 0;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await query("DELETE FROM admin_users WHERE id = $1", [id]);
}

export async function setAdminUserPassword(id: string, password: string): Promise<boolean> {
  const hash = await hashPassword(password);
  const rows = await query<{ id: string }>(
    "UPDATE admin_users SET password_hash = $1 WHERE id = $2 RETURNING id",
    [hash, id]
  );
  return rows.length > 0;
}

export async function getAdminUserByName(
  username: string
): Promise<{ id: string; username: string; password_hash: string } | null> {
  const rows = await query<{ id: string; username: string; password_hash: string }>(
    "SELECT id::text AS id, username, password_hash FROM admin_users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim()]
  );
  return rows[0] ?? null;
}

/** Verify a login against the DB users. Returns {username, tag} (canonical), else null. */
export async function verifyAdminUser(
  username: string,
  password: string
): Promise<{ username: string; tag: string | null } | null> {
  const rows = await query<{ id: string; username: string; password_hash: string; sms_tag: string | null }>(
    "SELECT id, username, password_hash, sms_tag FROM admin_users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim()]
  );
  if (rows.length === 0) return null;
  const ok = await verifyPassword(password, rows[0].password_hash);
  if (!ok) return null;
  await query("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", [rows[0].id]);
  return { username: rows[0].username, tag: rows[0].sms_tag ?? null };
}

/** Change a DB user's own password (verifies current first). Returns a status. */
export async function changeAdminUserPassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<"ok" | "not-db-user" | "wrong-current"> {
  const rows = await query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM admin_users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim()]
  );
  if (rows.length === 0) return "not-db-user";
  const ok = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!ok) return "wrong-current";
  const hash = await hashPassword(newPassword);
  await query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
  return "ok";
}
