import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
import { ConciliacaoClient } from "./conciliacao-client";
import { format, addMonths } from "date-fns";

export const dynamic = "force-dynamic";

export default async function ConciliacaoPage() {
  const today = new Date();
  const currentMonth = format(today, "yyyy-MM");
  const prevMonth = format(addMonths(today, -1), "yyyy-MM");

  // Planos ativos (sem end_date) com clientName
  const rows = await db
    .select({
      planId: schema.subscriptionPlans.id,
      clientId: schema.subscriptionPlans.clientId,
      planValue: schema.subscriptionPlans.planValue,
      clientName: schema.clients.name,
    })
    .from(schema.subscriptionPlans)
    .innerJoin(schema.clients, (j: any) =>
      j.eq(schema.subscriptionPlans.clientId, schema.clients.id)
    )
    .where(isNull(schema.subscriptionPlans.endDate))
    .all() as any[];

  const activePlans = rows.map((r: any) => ({
    planId: r.planId,
    clientName: r.clientName,
    planValue: r.planValue,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conciliação bancária</h1>
        <p className="text-muted-foreground mt-1">
          Cole o extrato do banco para identificar e registrar pagamentos automaticamente
        </p>
      </div>

      <ConciliacaoClient
        activePlans={activePlans}
        currentMonth={currentMonth}
        prevMonth={prevMonth}
      />
    </div>
  );
}
