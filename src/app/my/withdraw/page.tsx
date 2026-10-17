import {AccountWithdrawal} from "@/components/account/AccountWithdrawal";
import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
export const metadata={title:"회원 탈퇴"};
export default async function WithdrawalPage(){
  const client=await createClient();const {data,error}=await client.auth.getUser();
  if(error||!data.user)redirect("/login?next=%2Fmy%2Fwithdraw");
  return <main className="mx-auto max-w-2xl px-4 py-8"><AccountWithdrawal key={data.user.id} viewerId={data.user.id}/></main>;
}
