import { cookies } from "next/headers";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change password · Checkin Admin" };

export default async function AccountPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const envAdmin = process.env.ADMIN_USERNAME || "admin";
  const isRecovery = session
    ? session.username.toLowerCase() === envAdmin.toLowerCase()
    : false;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Change password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <strong className="text-slate-700">{session?.username}</strong>. Apna login
          password yahan badlein.
        </p>
      </div>

      {isRecovery ? (
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Aap <strong>built-in recovery admin</strong> se logged-in ho — iska password server
          settings (Vercel env) me hai, yahan se change nahi hota. <br />
          <br />
          <strong>Users</strong> page par apna admin user banao, phir usse login karke password
          yahan se badal sakte ho.
        </div>
      ) : (
        <ChangePasswordForm />
      )}
    </div>
  );
}
