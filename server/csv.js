// CSV export of a list (RFC 4180, UTF-8 with byte-order mark so that spreadsheet programs detect the encoding).
import { sortItems } from '../public/js/shared/ordering.js';

const cell = (value) => {
  const s = String(value ?? '');
  return /[",;\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};

export function listToCsv(list) {
  const rows = [['name', 'quantity', 'checked', 'deleted']];
  for (const item of sortItems(list.items, list.ranks, null)) {
    rows.push([item.name, item.qty ?? 1, !!item.checked, !!item.deleted]);
  }
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
