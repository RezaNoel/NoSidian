// Line diff (LCS) laid out as side-by-side rows for the history viewer.
export interface DiffRow { left: string | null; right: string | null; kind: "same" | "del" | "add" | "change"; ln: number | null; rn: number | null }

export function diffLines(a: string, b: string): DiffRow[] {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const ops: ("=" | "-" | "+")[] = [];
  if (n * m > 4_000_000) {
    for (let i = 0; i < Math.max(n, m); i++) {
      if (A[i] === B[i]) ops.push("=");
      else { if (i < n) ops.push("-"); if (i < m) ops.push("+"); }
    }
  } else {
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { ops.push("="); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { ops.push("+"); j++; }
      else { ops.push("-"); i++; }
    }
  }
  const rows: DiffRow[] = [];
  let i = 0, j = 0, k = 0;
  while (k < ops.length) {
    if (ops[k] === "=") { rows.push({ left: A[i], right: B[j], kind: "same", ln: ++i, rn: ++j }); k++; continue; }
    const dels: string[] = [], adds: string[] = [];
    while (k < ops.length && ops[k] !== "=") { if (ops[k] === "-") dels.push(A[i + dels.length]); else adds.push(B[j + adds.length]); k++; }
    for (let x = 0; x < Math.max(dels.length, adds.length); x++) {
      const l = x < dels.length ? dels[x] : null, r = x < adds.length ? adds[x] : null;
      rows.push({ left: l, right: r, kind: l !== null && r !== null ? "change" : l !== null ? "del" : "add", ln: l !== null ? i + x + 1 : null, rn: r !== null ? j + x + 1 : null });
    }
    i += dels.length; j += adds.length;
  }
  return rows;
}
