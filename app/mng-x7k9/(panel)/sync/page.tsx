import SyncHotelsManager from "@/components/SyncHotelsManager";

export const metadata = { title: "Office Sync" };

export default function SyncPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">Office Sync</h1>
      <p className="mt-1 text-sm text-slate-500">
        A view-only copy of a hotel&apos;s CHECKIN data for the owner&apos;s office. The hotel PC sends its data here
        encrypted; the office PC takes it from here. This server cannot read it.
      </p>

      <div className="mt-6">
        <SyncHotelsManager />
      </div>

      <div className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Kaise jodna hai</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Upar hotel ka naam likh kar <strong>Add hotel</strong> dabaayein; jo setup code dikhe use likh lein.</li>
          <li>
            Hotel ke computer par <strong>CKSYNC</strong> chala kar <strong>Hotel setup</strong> me wo code daalein. Wahan ek{" "}
            <strong>office key</strong> dikhegi.
          </li>
          <li>
            Office ke computer par <strong>CKSYNC</strong> &gt; <strong>Office setup</strong> me wo office key daalein. Ab office me
            CHECKIN chalate hi data aa jayega.
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          Office key sirf hotel ke computer par banti hai aur yahan kabhi nahi aati. Kho jaye to hotel ke CKSYNC me dobara dekhi ja
          sakti hai.
        </p>
      </div>
    </div>
  );
}
