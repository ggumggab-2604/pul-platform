import { ComposePage } from "@/components/messaging/MessagingPages";

// Next page props are always supplied; keep the shared composer's optional props contract.
export default async function Page(props: { searchParams: Promise<{ store?:string|string[]; provider?:string|string[]; listing?: string | string[]; request?:string|string[] }> }) {
  return ComposePage(props);
}
