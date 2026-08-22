import Link from "next/link";
import UserLoginForm from "@/components/UserLoginForm";

export const metadata = { title: "Login · Checkin" };

export default function UserLoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Checkin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Log in with your mobile number to get message alerts
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <UserLoginForm />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-slate-500 hover:underline">
            ← Back to checkin.co.in
          </Link>
        </p>
      </div>
    </main>
  );
}
