import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, History, Inbox } from "lucide-react";

import {
  operationsActivityLabels,
  operationsQueueRegistry,
  operationsSignalRegistry,
  operationsUpcomingRegistry,
  type OperationsDashboard as OperationsDashboardData,
  type OperationsSeverity,
  type OperationsUrgency,
} from "@/lib/operations/operationsDashboard";

function relativeAge(days: number) {
  if (days === 0) return "오늘 접수";
  if (days === 1) return "1일 경과";
  return `${days}일 경과`;
}

function urgencyClass(urgency: OperationsUrgency) {
  if (urgency === "overdue") return "bg-red-50 text-red-800";
  if (urgency === "attention") return "bg-amber-50 text-amber-800";
  return "bg-pul-light text-pul-deep";
}

function severityClass(severity: OperationsSeverity) {
  if (severity === "critical") return "border-red-200 bg-red-50";
  if (severity === "warning") return "border-amber-200 bg-amber-50";
  return "border-sky-200 bg-sky-50";
}

function ManagementDestination({ href }: { href?: string }) {
  if (!href) {
    return (
      <span className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">
        관리 화면 미구축
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-pul-deep px-4 text-sm font-black text-white hover:bg-pul-point focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
    >
      바로 확인하기 <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function OperationsDashboard({
  dashboard,
  loadFailed,
}: {
  dashboard: OperationsDashboardData | null;
  loadFailed: boolean;
}) {
  if (loadFailed || !dashboard) {
    return (
      <section aria-labelledby="operations-dashboard-heading" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <h2 id="operations-dashboard-heading" className="text-xl font-black text-foreground">운영 현황</h2>
        <p role="status" className="mt-3 text-base leading-7 text-amber-900">
          운영 현황을 불러오지 못했습니다. 각 관리 업무는 아래에서 직접 확인할 수 있습니다.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-6 min-w-0 space-y-6" data-testid="operations-dashboard">
      <section aria-labelledby="operations-dashboard-heading">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-pul-point" aria-hidden="true" />
          <h2 id="operations-dashboard-heading" className="text-2xl font-black text-foreground">오늘 확인 필요</h2>
        </div>
        {dashboard.attention.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-pul-border bg-white p-5 text-base leading-7 text-pul-muted">
            현재 확인이 필요한 운영 요청이 없습니다.
          </p>
        ) : (
          <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">
            {dashboard.attention.map((item) => {
              const registry = operationsQueueRegistry[item.queueKey];
              return (
                <article key={item.queueKey} className="min-w-0 rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.05)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black text-foreground">{registry.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-pul-muted">{registry.description}</p>
                    </div>
                    <span className="shrink-0 text-3xl font-black tabular-nums text-pul-deep">{item.count}건</span>
                  </div>
                  <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-bold ${urgencyClass(item.urgency)}`}>
                    가장 오래된 요청 · {relativeAge(item.ageDays)}
                  </span>
                  <ManagementDestination href={registry.href} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {dashboard.upcoming.length > 0 && (
        <section aria-labelledby="operations-upcoming-heading">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-pul-point" aria-hidden="true" />
            <h2 id="operations-upcoming-heading" className="text-xl font-black text-foreground">예정·주의</h2>
          </div>
          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            {dashboard.upcoming.map((item) => {
              const registry = operationsUpcomingRegistry[item.itemKey];
              return (
                <article key={item.itemKey} className={`min-w-0 rounded-2xl border p-5 ${severityClass(item.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black text-foreground">{registry.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-pul-muted">{registry.description}</p>
                    </div>
                    <span className="shrink-0 text-2xl font-black tabular-nums text-foreground">{item.count}건</span>
                  </div>
                  <ManagementDestination href={registry.href} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {dashboard.automationSignals.length > 0 && (
        <section aria-labelledby="operations-signals-heading">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
            <h2 id="operations-signals-heading" className="text-xl font-black text-foreground">점검 필요</h2>
          </div>
          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            {dashboard.automationSignals.map((item) => {
              const registry = operationsSignalRegistry[item.signalKey];
              return (
                <article key={item.signalKey} className={`min-w-0 rounded-2xl border p-5 ${severityClass(item.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black text-foreground">{registry.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-pul-muted">{registry.description}</p>
                    </div>
                    <span className="shrink-0 text-2xl font-black tabular-nums text-foreground">{item.count}건</span>
                  </div>
                  <ManagementDestination href={registry.href} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="operations-activity-heading">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-pul-point" aria-hidden="true" />
          <h2 id="operations-activity-heading" className="text-xl font-black text-foreground">최근 운영 활동</h2>
        </div>
        {dashboard.recentActivity.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-pul-border bg-white p-5 text-base text-pul-muted">표시할 최근 운영 활동이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-pul-border overflow-hidden rounded-2xl border border-pul-border bg-white">
            {dashboard.recentActivity.map((item, index) => (
              <li key={`${item.occurredAt}-${item.action}-${index}`} className="flex min-w-0 flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="min-w-0 break-words text-base font-bold text-foreground">{operationsActivityLabels[item.action]}</span>
                <span className="shrink-0 text-sm text-pul-muted">
                  {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(item.occurredAt))}
                  {item.outcome === "noop" ? " · 변경 없음" : " · 완료"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
