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
          password yahan badlein. <strong>Current password</strong> me abhi jo password se login
          karte ho wahi daalein.
        </p>
      </div>

      {isRecovery && (
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Aap <strong>{envAdmin}</strong> (recovery admin) ho. Yahan password badalne ke baad
          <strong> naya password DB me save</strong> ho jayega aur purana (server-settings wala)
          band ho jayega.
        </div>
      )}

      <ChangePasswordForm />
    </div>
  );
}
