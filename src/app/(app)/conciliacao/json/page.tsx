import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JsonImportClient } from "./json-import-client";

export const dynamic = "force-dynamic";

export default async function ConciliacaoJsonPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/conciliacao"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft size={14} />
          Voltar para conciliação por texto
        </Link>
        <h1 className="text-2xl font-bold">Conciliação via JSON do ChatGPT</h1>
        <p className="text-muted-foreground mt-1">
          Pré-classifique o extrato no ChatGPT e cole o JSON aqui para
          registrar pagamentos, receitas avulsas e despesas em lote.
        </p>
      </div>

      <JsonImportClient />
    </div>
  );
}
