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
            Hotel ke computer par <strong>UTILITY</strong> me MAIN adhikar wale user se login karke{" "}
            <strong>Misc. &gt; Office Sync &gt; 1. Hotel setup</strong> me wo code daalein. Wahan ek <strong>office key</strong>{" "}
            dikhegi.
          </li>
          <li>
            Office ke computer par CHECKIN folder me <strong>UTILITY</strong> chalayein. Wahan data nahi hota, isliye wo poochhega
            ki yeh office ka computer hai kya: <strong>Yes</strong> chun kar <strong>2. Office setup</strong> me office key
            daalein. Ab office me CHECKIN chalate hi data aa jayega.
          </li>
          <li>
            Malik ke phone ke liye (sold rooms, collection, sale): hotel ke computer par{" "}
            <strong>UTILITY &gt; Misc. &gt; Office Sync &gt; 7. Mobile app key</strong> kholein aur wahan dikhe QR ko phone ke
            camera se scan karein; ya phone me <strong>checkin.co.in/owner</strong> khol kar wahi key likhein. Hotel par naya
            CHECKIN.exe aur UTILITY.exe dono ek hi folder me hone chahiye.
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          Alag CKSYNC.exe ab nahi chahiye: bhejna aur utarna UTILITY.exe hi karta hai. Office key sirf hotel ke computer par banti
          hai aur yahan kabhi nahi aati; kho jaye to hotel ke UTILITY &gt; Misc. &gt; Office Sync &gt; 4 me dobara dekhi ja sakti
          hai.
        </p>
      </div>
    </div>
  );
}
