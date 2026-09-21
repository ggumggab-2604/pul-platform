import { BlockedPage, type MessagingQuery } from "@/components/messaging/MessagingPages";
export default function Page({ searchParams }: { searchParams: Promise<MessagingQuery> }) { return <BlockedPage searchParams={searchParams} />; }
