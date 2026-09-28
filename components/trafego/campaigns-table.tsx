"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Node } from "@/lib/traffic/tree";
import { statusPt } from "@/lib/traffic/format";

type Col = { key: string; label: string; get: (n: Node) => number | null; fmt: (v: number | null) => string; lowGood?: boolean };

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const int = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const dec = (v: number | null, s = "") => (v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${s}`);

const COLS: Col[] = [
  { key: "spend", label: "Invest.", get: (n) => n.m.spend, fmt: brl },
  { key: "value", label: "Faturamento", get: (n) => n.m.purchase_value, fmt: brl },
  { key: "roas", label: "ROAS", get: (n) => n.m.roas, fmt: (v) => dec(v, "x") },
  { key: "purchases", label: "Compras", get: (n) => n.m.purchases, fmt: int },
  { key: "cpa", label: "CPA", get: (n) => n.m.cpa, fmt: brl, lowGood: true },
  { key: "impressions", label: "Impr.", get: (n) => n.m.impressions, fmt: int },
  { key: "cpm", label: "CPM", get: (n) => n.m.cpm, fmt: brl, lowGood: true },
  { key: "link_clicks", label: "Cliques link", get: (n) => n.m.link_clicks, fmt: int },
  { key: "ctr", label: "CTR", get: (n) => n.m.ctr, fmt: (v) => dec(v, "%") },
  { key: "cpc", label: "CPC", get: (n) => n.m.cpc, fmt: brl, lowGood: true },
  { key: "lpv", label: "Vis. pág.", get: (n) => n.m.landing_page_views, fmt: int },
  { key: "atc", label: "Carrinho", get: (n) => n.m.add_to_cart, fmt: int },
  { key: "ic", label: "Checkout", get: (n) => n.m.initiate_checkout, fmt: int },
  { key: "freq", label: "Freq. 7d", get: (n) => n.frequency7d ?? null, fmt: (v) => dec(v) },
];

function sortNodes(nodes: Node[], col: Col, dir: 1 | -1): Node[] {
  return [...nodes]
    .sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    })
    .map((n) => ({ ...n, children: sortNodes(n.children, col, dir) }));
}

export function CampaignsTable({ tree, metaRoas }: { tree: Node[]; metaRoas: number | null }) {
  const [sortKey, setSortKey] = useState("spend");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyActive, setOnlyActive] = useState(false);

  const col = COLS.find((c) => c.key === sortKey) ?? COLS[0];
  const rows = useMemo(
    () => sortNodes(onlyActive ? tree.filter((n) => n.status === "ACTIVE") : tree, col, dir),
    [tree, col, dir, onlyActive],
  );

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderRow = (n: Node, depth: number): React.ReactNode => {
    const key = `${n.level}:${n.id}`;
    const expandable = n.children.length > 0;
    const isOpen = open.has(key);
    const roasColor =
      metaRoas && n.m.roas != null ? (n.m.roas >= metaRoas ? "var(--t-gold-light)" : n.m.roas >= metaRoas * 0.7 ? "var(--t-amber)" : "var(--t-critical)") : undefined;
    return (
      <Fragment key={key}>
        <tr>
          <td style={{ paddingLeft: 12 + depth * 18 }} className="max-w-[320px]">
            <div className="flex items-center gap-1.5">
              {expandable ? (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Recolher" : "Expandir"} ${n.name}`}
                  className="t-gold grid h-5 w-5 shrink-0 place-items-center"
                >
                  <ChevronRight className="h-4 w-4 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <span className="truncate" title={n.name} style={{ fontWeight: depth === 0 ? 600 : 400 }}>
                {n.name}
              </span>
              {n.status && n.status !== "ACTIVE" && <span className="t-muted text-[10px]">({statusPt(n.status)})</span>}
            </div>
            <p className="t-muted pl-6 text-[10px]">
              {n.level === "campaign" ? "Campanha" : n.level === "adset" ? "Conjunto" : "Anúncio"} · {n.unidade ?? "—"}
            </p>
          </td>
          {COLS.map((c) => (
            <td
              key={c.key}
              style={
                c.key === "roas"
                  ? { color: roasColor }
                  : c.key === "freq" && (n.frequency7d ?? 0) > 3.5
                    ? { color: "var(--t-amber)" }
                    : undefined
              }
            >
              {c.fmt(c.get(n))}
            </td>
          ))}
        </tr>
        {isOpen && n.children.map((ch) => renderRow(ch, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="t-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <label className="t-muted flex items-center gap-2 text-xs">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-[#d4af37]" />
          Só campanhas ativas
        </label>
        <button
          type="button"
          className="t-pill"
          onClick={() =>
            setOpen((s) =>
              s.size ? new Set() : new Set(tree.flatMap((c) => [`campaign:${c.id}`, ...c.children.map((a) => `adset:${a.id}`)])),
            )
          }
        >
          {open.size ? "Recolher tudo" : "Expandir tudo"}
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="t-table">
          <thead>
            <tr>
              <th>Nome</th>
              {COLS.map((c) => (
                <th key={c.key} aria-sort={sortKey === c.key ? (dir === 1 ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    className="uppercase"
                    onClick={() => {
                      if (sortKey === c.key) setDir((d) => (d === 1 ? -1 : 1));
                      else {
                        setSortKey(c.key);
                        setDir(c.lowGood ? 1 : -1);
                      }
                    }}
                  >
                    {c.label} {sortKey === c.key ? (dir === 1 ? "▲" : "▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="t-muted !text-center">
                  Nenhuma entrega no período.
                </td>
              </tr>
            ) : (
              rows.map((n) => renderRow(n, 0))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
