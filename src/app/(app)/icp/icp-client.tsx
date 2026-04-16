"use client";

import { formatBRL } from "@/lib/utils/formatting";
import type { ICPData, Distribution } from "@/lib/queries/icp";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function DistributionCard({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Distribution[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? "Sem dados. Preencha o perfil das clientes para ver as distribuições."}
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...items.map((i) => i.count));

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <span>{item.label}</span>
              <span className="text-muted-foreground">
                {item.count} ({item.percent}%)
                {item.avgTicket != null && (
                  <span className="ml-2 font-mono text-xs">
                    ticket médio {formatBRL(item.avgTicket)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ICPClient({ data }: { data: ICPData }) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Clientes ativas" value={String(data.totalActive)} />
        <StatCard
          label="Ticket médio mensal"
          value={data.avgTicketMensal ? formatBRL(data.avgTicketMensal) : "—"}
        />
        <StatCard
          label="Valor médio consulta"
          value={data.avgConsultaTicket ? formatBRL(data.avgConsultaTicket) : "—"}
        />
        <StatCard
          label="Idade média"
          value={data.avgAge ? `${Math.round(data.avgAge)} anos` : "—"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Tempo médio de prática"
          value={data.avgYearsInPractice ? `${Math.round(data.avgYearsInPractice)} anos` : "—"}
        />
        <StatCard
          label="Total de clientes"
          value={`${data.totalActive} ativas / ${data.totalClients} total`}
        />
      </div>

      {/* Distribuições */}
      <div className="grid md:grid-cols-2 gap-6">
        <DistributionCard
          title="Por nicho"
          items={data.byNiche}
          emptyMessage="Preencha o nicho no perfil das clientes."
        />
        <DistributionCard
          title="Por estado"
          items={data.byState}
          emptyMessage="Preencha a cidade/estado no perfil das clientes."
        />
        <DistributionCard
          title="Por cidade"
          items={data.byCity}
          emptyMessage="Preencha a cidade no perfil das clientes."
        />
        <DistributionCard
          title="Consultório físico"
          items={data.byOffice}
          emptyMessage="Preencha o campo de consultório no perfil das clientes."
        />
      </div>

      {/* Hint */}
      <div className="bg-muted/50 border rounded-lg p-4 text-sm text-muted-foreground">
        <p>
          <strong>Dica:</strong> Para ter insights mais ricos, preencha o perfil profissional de cada
          cliente (nicho, cidade, valor de consulta, etc.) no botão de editar na aba{" "}
          <a href="/clientes" className="underline text-primary">Clientes</a>.
        </p>
      </div>
    </div>
  );
}
