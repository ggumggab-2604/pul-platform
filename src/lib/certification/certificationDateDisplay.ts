export type CertificationDateDisplay = Readonly<{
  label: string;
  value: string;
}>;

type CertificationDateRangeLabels = Readonly<{
  range: string;
  start: string;
  end: string;
}>;

export function formatCertificationPublicDateOnly(value: string | null) {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function getCertificationDateDisplay(
  value: string | null,
  label: string,
): CertificationDateDisplay | null {
  const formatted = formatCertificationPublicDateOnly(value);
  return formatted === null ? null : { label, value: formatted };
}

export function getCertificationDateRangeDisplay(
  start: string | null,
  end: string | null,
  labels: CertificationDateRangeLabels,
): CertificationDateDisplay | null {
  const formattedStart = formatCertificationPublicDateOnly(start);
  const formattedEnd = formatCertificationPublicDateOnly(end);

  if (formattedStart !== null && formattedEnd !== null) {
    return { label: labels.range, value: `${formattedStart} ~ ${formattedEnd}` };
  }
  if (formattedStart !== null) return { label: labels.start, value: formattedStart };
  if (formattedEnd !== null) return { label: labels.end, value: formattedEnd };
  return null;
}
