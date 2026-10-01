// Trigger a file download in the browser.
//
// Kept in one place so every "export CSV" action (the BP/glucose screen and the
// logout prompt) behaves identically: the same blob type, the same anchor
// click, and the object URL revoked afterwards. This touches the DOM, so it is
// deliberately *not* part of the pure `bpGlucose` module — callers there take a
// `download` callback instead.

export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
