"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import type { RevenueRow, RevenuesSummary } from "@/lib/services/revenues";
import { RevenueDialog } from "./revenue-dialog";
import { DeleteRevenueDialog } from "./delete-revenue-dialog";
import { EditClientQuickDialog } from "../clientes/edit-client-quick-dialog";

interface Props {
  revenues: RevenueRow[];
  summary: RevenuesSummary;
  clients: { id: number; name: string }[];
}

export function RevenuesClient({ revenues, summary, clients }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pago" | "pendente">("todos");
  const [clientFilter, setClientFilter] = useState<string>("todos");
  const [productFilter, setProductFilter] = useState<string>("todos");

  const [newOpen, setNewOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueRow | null>(null);
  const [deleting, setDeleting] = useState<RevenueRow | null>(null);

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const r of revenues) set.add(r.product);
    return Array.from(set).sort();
  }, [revenues]);

  const filtered = useMemo(() => {
    return revenues.filter((r) => {
      if (search) {
        const s = search.toLowerCase();
        const hit =
          r.product.toLowerCase().includes(s) ||
          (r.clientName?.toLowerCase().includes(s) ?? false) ||
          (r.channel?.toLowerCase().includes(s) ?? false) ||
          (r.campaign?.toLowerCase().includes(s) ?? false);
        if (!hit) return false;
      }
      if (statusFilter === "pago" && !r.isPaid) return false;
      if (statusFilter === "pendente" && r.isPaid) return false;
      if (clientFilter !== "todos") {
        if (clientFilter === "sem") {
          if (r.clientId !== null) return false;
        } else if (String(r.clientId) !== clientFilter) return false;
      }
      if (productFilter !== "todos" && r.product !== productFilter) return false;
      return true;
    });
  }, [revenues, search, statusFilter, clientFilter, productFilter]);

  const totalFiltrado = filtered.reduce((s, r) => s + (r.isPaid ? r.amount : 0), 0);

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Este mês"
          value={formatBRL(summary.totalMesAtual)}
          sub={`${summary.qtdMesAtual} receita${summary.qtdMesAtual === 1 ? "" : "s"}`}
        />
        <SummaryCard label="Este ano" value={formatBRL(summary.totalAno)} />
        <SummaryCard
          label="Total geral"
          value={formatBRL(summary.totalGeral)}
          sub={`${summary.qtdTotal} receita${summary.qtdTotal === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Pendentes"
          value={formatBRL(summary.totalPendente)}
          tone={summary.totalPendente > 0 ? "warning" : "muted"}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar produto / cliente / canal"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clientFilter} onValueChange={(v) => v && setClientFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos clientes</SelectItem>
            <SelectItem value="sem">Sem cliente vinculado</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {products.length > 0 && (
          <Select value={productFilter} onValueChange={(v) => v && setProductFilter(v)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos produtos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" onClick={() => setNewClientOpen(true)} className="ml-auto">
          <Plus size={16} /> Cadastrar cliente
        </Button>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={16} /> Nova receita
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma receita avulsa registrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{formatDate(r.date)}</TableCell>
                  <TableCell className="font-medium">
                    {r.product}
                    {r.installmentsTotal && r.installmentNumber && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        {r.installmentNumber}/{r.installmentsTotal}x
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.clientName ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.channel ?? ""}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatBRL(r.amount)}
                  </TableCell>
                  <TableCell>
                    {r.isPaid ? (
                      <Badge className="bg-success/10 text-success border-success/20">
                        Pago
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-accent-foreground border-accent/40 bg-accent/10">
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t text-xs text-muted-foreground flex justify-between">
            <span>
              {filtered.length} receita{filtered.length === 1 ? "" : "s"}
            </span>
            <span>
              Total (pagas): <strong>{formatBRL(totalFiltrado)}</strong>
            </span>
          </div>
        )}
      </div>

      <RevenueDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clients={clients}
      />
      <RevenueDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        clients={clients}
        editing={editing}
      />
      <DeleteRevenueDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        revenue={deleting}
      />

      {newClientOpen && (
        <EditClientQuickDialog
          open={newClientOpen}
          onClose={() => setNewClientOpen(false)}
          mode="create"
        />
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "muted";
}) {
  const valueTone =
    tone === "warning" ? "text-accent-foreground" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold font-mono ${valueTone}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
