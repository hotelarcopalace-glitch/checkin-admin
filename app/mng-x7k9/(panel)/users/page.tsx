import UsersManager from "@/components/UsersManager";
import { listAdminUsers, type AdminUser } from "@/lib/admin-users";
import { hasDatabase } from "@/lib/db";
import { SetupNotice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · Checkin Admin" };

export default async function UsersPage() {
  const envAdmin = process.env.ADMIN_USERNAME || "admin";

  if (!hasDatabase()) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <SetupNotice reason="no-url" />
      </div>
    );
  }

  let users: AdminUser[] = [];
  let needsSetup = false;
  try {
    users = await listAdminUsers();
    // The recovery admin is shown as its own fixed row, so drop it from the
    // editable list even after it has been promoted into the DB.
    users = users.filter((u) => u.username.toLowerCase() !== envAdmin.toLowerCase());
  } catch {
    needsSetup = true;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Admin users banao aur unke password set karo. Ye users <code>/mng-x7k9</code> me login kar
          sakte hain.
        </p>
      </div>
      {needsSetup ? <SetupNotice reason="no-table" /> : <UsersManager users={users} envAdmin={envAdmin} />}
    </div>
  );
}
