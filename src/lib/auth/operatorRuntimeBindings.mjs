// Trusted server composition root. No environment-variable fixture fallback.
// Follow-up: verified production adapter, independent store and shared signer.
// Consent collection is a SEPARATE explicit binding.
export function getWithdrawalRuntime(){return null;}
/** @returns {null | {store: {read: () => Promise<object> | object}, scope: {project: string, containerId: string}}} */
export function getConsentRuntime(){return null;}
