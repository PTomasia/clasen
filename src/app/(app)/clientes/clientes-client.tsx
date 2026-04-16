"use client";

import { useState, useMemo, useTransition } from "react";
import { updateClientAction } from "@/lib/actions/plans";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  Pencil,
} from "lucide-react";
import { formatBRL } from "@/lib/utils/formatting";
import { ClientDetailDialog } from "./client-detail-dialog";
import { EditClientQuickDialog, type EditClientQuickData } from "./edit-client-quick-dialog";
import type { ClientRow } from "@/lib/services/clients";

type SortKey = "name" | "permanencia" | "planosAtivos" | "valorMensal" | "custoPostMedio" | "status" | "contactOrigin";
type SortDirection = "asc" | "desc" | null;

const ORIGINS = ["Instagram", "Indicação", "Google", "WhatsApp", "Outro"];

export function ClientesClient({ clients }: { clients: ClientRow[] }) {
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [originFilter, setOriginFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [detailClientId, setDetailClientId] = useState<{ id: number; name: string } | null>(null);
  const [editData, setEditData] = useState<EditClientQuickData | null>(null);
  const [updatingOriginId, setUpdatingOriginId] = useState<number | null>(null);
  const [, startOriginTransition] = useTransition();

  function handleOriginChange(client: ClientRow, newOriginRaw: string | null) {
    const newOrigin = newOriginRaw ?? "";
    if (newOrigin === (client.contactOrigin ?? "")) return;
    setUpdatingOriginId(client.id);
    startOriginTransition(async () => {
      try {
        await updateClientAction({
          clientId: client.id,
          name: client.name,
          contactOrigin: newOrigin || undefined,
          clientSince: client.clientSince ?? undefined,
          birthday: client.birthday ?? undefined,
          whatsapp: client.whatsapp ?? undefined,
          city: client.city ?? undefined,
          state: client.state ?? undefined,
          niche: client.niche ?? undefined,
          yearsInPractice: client.yearsInPractice ?? undefined,
          consultaTicket: client.consultaTicket ?? undefined,
          hasPhysicalOffice: client.hasPhysicalOffice ?? undefined,
          birthYear: client.birthYear ?? undefined,
          targetAudience: client.targetAudience ?? undefined,
          notes: client.notes ?? undefined,
        });
      } finally {
        setUpdatingOriginId(null);
      }
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown size={12} className="text-muted-foreground/50" />;
    if (sortDir === "asc") return <ArrowUp size={12} />;
    return <ArrowDown size={12} />;
  }

  const filtered = useMemo(() => {
    let result = clients;

    // Status filter
    if (statusFilter !== "todos") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Origin filter
    if (originFilter !== "todos") {
      result = result.filter((c) => c.contactOrigin === originFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Sort
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];

        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;

        let cmp = 0;
        if (typeof va === "string" && typeof vb === "string") {
          cmp = va.localeCompare(vb, "pt-BR");
        } else {
          cmp = (va as number) - (vb as number);
        }

        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [clients, statusFilter, originFilter, search, sortKey, sortDir]);

  // Summary metrics (from filtered active clients)
  const activeClients = clients.filter((c) => c.status === "ativo");
  const totalAtivos = activeClients.length;
  const permMedia = activeClients.length > 0
    ? Math.round(activeClients.reduce((s, c) => s + c.permanencia, 0) / activeClients.length)
    : 0;

  // Mediana de permanência (todos)
  const allPerms = [...clients.map((c) => c.permanencia)].sort((a, b) => a - b);
  const mediana = allPerms.length === 0
    ? 0
    : allPerms.length % 2 === 1
      ? allPerms[Math.floor(allPerms.length / 2)]
      : Math.round((allPerms[Math.floor(allPerms.length / 2) - 1] + allPerms[Math.floor(allPerms.length / 2)]) / 2);

  const ticketMedio = activeClients.length > 0
    ? activeClients.reduce((s, c) => s + c.valorMensal, 0) / activeClients.length
    : 0;

  const hasFilters = statusFilter !== "todos" || originFilter !== "todos" || search.trim() !== "";

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Clientes ativos</p>
          <p className="text-2xl font-bold">{totalAtivos}</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Perm. média (ativos)</p>
          <p className="text-2xl font-bold">{permMedia} meses</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Perm. mediana (todos)</p>
          <p className="text-2xl font-bold">{mediana} meses</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Ticket médio</p>
          <p className="text-2xl font-bold">{formatBRL(ticketMedio)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["todos", "ativo", "inativo"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === "todos" ? "Todos" : s === "ativo" ? "Ativos" : "Inativos"}
            </Button>
          ))}
        </div>

        <Select value={originFilter} onValueChange={(v) => v && setOriginFilter(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas origens</SelectItem>
            {ORIGINS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter("todos"); setOriginFilter("todos"); setSearch(""); }}
          >
            Limpar filtros
          </Button>
        )}

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} de {clients.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => handleSort("name")}>
                  Cliente <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => handleSort("contactOrigin")}>
                  Origem <SortIcon column="contactOrigin" />
                </button>
              </TableHead>
              <TableHead>
                <button className="flex items-center gap-1" onClick={() => handleSort("status")}>
                  Status <SortIcon column="status" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button className="flex items-center gap-1 ml-auto" onClick={() => handleSort("permanencia")}>
                  Permanência <SortIcon column="permanencia" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button className="flex items-center gap-1 ml-auto" onClick={() => handleSort("planosAtivos")}>
                  Planos <SortIcon column="planosAtivos" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button className="flex items-center gap-1 ml-auto" onClick={() => handleSort("valorMensal")}>
                  Valor/mês <SortIcon column="valorMensal" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button className="flex items-center gap-1 ml-auto" onClick={() => handleSort("custoPostMedio")}>
                  $/post <SortIcon column="custoPostMedio" />
                </button>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    <button
                      className="hover:underline hover:text-primary transition-colors text-left"
                      onClick={() => setDetailClientId({ id: client.id, name: client.name })}
                    >
                      {client.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Select
                      value={client.contactOrigin ?? ""}
                      onValueChange={(v) => handleOriginChange(client, v)}
                      disabled={updatingOriginId === client.id}
                    >
                      <SelectTrigger
                        className="h-7 w-[130px] border-transparent bg-transparent text-sm text-muted-foreground hover:border-input hover:bg-background focus:border-input data-[state=open]:border-input"
                      >
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIGINS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.status === "ativo" ? "default" : "secondary"}>
                      {client.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {client.permanencia}m
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {client.planosAtivos}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {client.valorMensal > 0 ? formatBRL(client.valorMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {client.custoPostMedio !== null ? formatBRL(client.custoPostMedio) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditData({
                        clientId: client.id,
                        name: client.name,
                        contactOrigin: client.contactOrigin,
                        clientSince: client.clientSince,
                        birthday: client.birthday,
                        whatsapp: client.whatsapp,
                        city: client.city,
                        state: client.state,
                        niche: client.niche,
                        yearsInPractice: client.yearsInPractice,
                        consultaTicket: client.consultaTicket,
                        hasPhysicalOffice: client.hasPhysicalOffice,
                        birthYear: client.birthYear,
                        targetAudience: client.targetAudience,
                        notes: client.notes,
                      })}
                      title="Editar cliente"
                    >
                      <Pencil size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {detailClientId && (
        <ClientDetailDialog
          open={!!detailClientId}
          onClose={() => setDetailClientId(null)}
          clientId={detailClientId.id}
          clientName={detailClientId.name}
        />
      )}

      {editData && (
        <EditClientQuickDialog
          open={!!editData}
          onClose={() => setEditData(null)}
          data={editData}
        />
      )}
    </>
  );
}
