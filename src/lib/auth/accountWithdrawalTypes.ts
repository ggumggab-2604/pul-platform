export type WithdrawalResult = {
  status: "ready" | "not_configured" | "auth_required" | "reauthenticate" | "blocked" | "failed" | "changed" | "partial" | "operator_required" | "operator_check_required" | "uncertain" | "unavailable" | "planned_complete";
  ticket?: string;
  posts?: number;
  comments?: number;
};
export const WITHDRAWAL_NOTICE = "탈퇴 후에도 게시글·댓글은 남으며, 작성자는 ‘탈퇴회원’으로 표시됩니다.";
export const WITHDRAWAL_MESSAGES: Record<WithdrawalResult["status"], string> = {
  ready: "‘탈퇴하기’를 선택하면 계정 정보 삭제가 시작됩니다. 감사 기록 등 별도 확인이 필요한 자료는 남을 수 있습니다.",
  not_configured: "현재 탈퇴 처리 연결이 준비되지 않아 계정을 변경하지 않았습니다. 문의가 필요하면 위 이메일을 이용해 주세요.",
  auth_required: "로그인 계정이 바뀌었거나 로그인 상태를 확인하지 못했습니다. 다시 로그인한 뒤 본인 계정을 확인해 주세요.",
  reauthenticate: "계정 삭제 전에 이메일 인증이 필요합니다. 인증 후 이 화면으로 돌아옵니다.",
  blocked: "다른 자료나 권한의 처리 확인이 필요해 탈퇴를 시작하지 않았습니다. 위 이메일로 문의해 주세요.",
  failed: "처리를 확인하지 못했습니다. 완료된 것으로 판단하지 마세요. 현재 처리 상태를 다시 확인해 주세요.",
  changed: "확인한 대상이나 처리 기준이 달라졌습니다. 현재 상태를 다시 확인해 주세요.",
  partial: "일부 처리가 진행됐지만 삭제가 끝나지 않았습니다. 이미 처리한 부분은 자동으로 복구되지 않습니다. 현재 상태를 확인해 이어서 처리할 수 있습니다.",
  operator_required: "계정 삭제는 확인됐지만 후속 정리가 남아 있습니다. 전체 처리가 완료된 상태는 아닙니다. 다시 로그인하거나 탈퇴를 반복하지 말고 위 이메일로 운영자에게 확인을 요청해 주세요.",
  operator_check_required: "계정 삭제 요청은 처리됐지만 이후 확인 조회에 실패해 계정의 최종 상태를 확인하지 못했습니다. 다시 로그인하거나 탈퇴를 반복하지 말고 위 이메일로 운영자에게 확인을 요청해 주세요. 전체 처리가 완료된 상태는 아닙니다.",
  uncertain: "탈퇴 처리 결과 확인이 필요합니다. 운영자에게 문의해 주세요.",
  unavailable: "현재 탈퇴 처리를 이용할 수 없습니다. 이 안내만으로 본인 계정의 탈퇴 진행 여부를 확인할 수 없습니다. 운영자에게 문의해 주세요.",
  planned_complete: "계정과 계획된 개인 정보 삭제가 처리됐습니다. 게시글·댓글은 ‘탈퇴회원’으로 남습니다. 감사·복원 기록 등 확인할 자료가 남아 서비스 전체 삭제 완료 상태는 아닙니다.",
};
