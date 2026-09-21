import { MailboxPage, type MessagingQuery } from "@/components/messaging/MessagingPages";
export default function Page({ searchParams }: { searchParams: Promise<MessagingQuery> }) { return <MailboxPage box="sent" searchParams={searchParams} />; }
