import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in · Checkin Admin" };

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            C
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Checkin Admin</h1>
          <p className="mt-1 text-sm text-slate-500">checkin.co.in control panel</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Authorised staff only. All sign-in attempts are rate limited.
        </p>
      </div>
    </main>
  );
}
