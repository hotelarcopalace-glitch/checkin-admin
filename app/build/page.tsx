import { redirect } from "next/navigation";
import { liveBuildUser } from "@/lib/build";
import BuildApp from "@/components/BuildApp";

export const metadata = { title: "BuildKhata" };
export const dynamic = "force-dynamic";

export default async function BuildHomePage() {
  const me = await liveBuildUser();
  if (!me) redirect("/build/login");
  return <BuildApp meName={me.name} />;
}
