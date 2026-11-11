export function csvCell(value: string) {
  const safe = /^(?:[\t\r\n]|\s*[=+@-])/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

