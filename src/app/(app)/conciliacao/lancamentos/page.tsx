import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getRecentLancamentos } from "@/lib/queries/lancamentos";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

export default async function LancamentosPage() {
  const lancamentos = await getRecentLancamentos(db, 80);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Lançamentos recentes</h1>
          <p className="text-muted-foreground mt-1">
            Últimos pagamentos de plano e receitas avulsas registrados — confira se
            algum cliente “atrasado” na verdade já teve lançamento
          </p>
        </div>
        <Link href="/conciliacao" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft size={16} className="mr-1.5" />
          Voltar à conciliação
        </Link>
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto">
        {lancamentos.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhum lançamento registrado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.map((l) => (
                <TableRow key={`${l.kind}-${l.id}`}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {formatDate(l.date)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        l.kind === "plano"
                          ? "border-primary/30 text-primary bg-primary/5"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }
                    >
                      {l.kind === "plano" ? "Plano" : "Avulso"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{l.clientName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                    {l.label}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatBRL(l.amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        l.pago
                          ? "border-success/50 text-success bg-success/5"
                          : "border-yellow-500/50 text-yellow-700 bg-yellow-500/5"
                      }
                    >
                      {l.pago ? "Pago" : "Pendente"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
