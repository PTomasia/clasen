import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import {
  createOrUpdateOperationalCheck,
  getOperationalChecks,
  getOperationalCheck,
  deleteOperationalCheck,
  type OperationalCheckInput,
} from "../operational";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE operational_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_month TEXT NOT NULL,
      period TEXT NOT NULL,
      nota_execucao_direta INTEGER NOT NULL,
      nota_revisao INTEGER NOT NULL,
      nota_direcao_criativa INTEGER NOT NULL,
      nota_energia INTEGER NOT NULL,
      nota_capacidade INTEGER NOT NULL,
      entregas_executadas_gabi INTEGER,
      gargalos TEXT,
      clientes_pesadas_ids TEXT,
      motivos_peso TEXT,
      comentario_clientes_pesadas TEXT,
      comentario TEXT,
      posts_totais INTEGER,
      unidades_operacionais REAL,
      carrosseis INTEGER,
      reels INTEGER,
      estaticos INTEGER,
      criativos_trafego INTEGER,
      avulsos INTEGER,
      copys_devolvidas INTEGER,
      designs_refeitos INTEGER,
      posts_revisados_gabi INTEGER,
      posts_revisados_pedro INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

const baseInput = (over: Partial<OperationalCheckInput> = {}): OperationalCheckInput => ({
  referenceMonth: "2026-06",
  period: "meio_mes",
  notaExecucaoDireta: 3,
  notaRevisao: 3,
  notaDirecaoCriativa: 3,
  notaEnergia: 3,
  notaCapacidade: 3,
  ...over,
});

describe("createOrUpdateOperationalCheck", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("cria check com notas mínimas", async () => {
    const row = await createOrUpdateOperationalCheck(db, baseInput());
    expect(row.id).toBeGreaterThan(0);
    expect(row.referenceMonth).toBe("2026-06");
    expect(row.period).toBe("meio_mes");
    expect(row.notaCapacidade).toBe(3);
  });

  it("serializa e desserializa arrays (gargalos, clientes pesadas, motivos)", async () => {
    const row = await createOrUpdateOperationalCheck(
      db,
      baseInput({
        gargalos: ["Copy", "Briefing"],
        clientesPesadasIds: [1, 5, 9],
        motivosPeso: ["Retrabalho de copy", "Urgência"],
      })
    );
    expect(row.gargalos).toEqual(["Copy", "Briefing"]);
    expect(row.clientesPesadasIds).toEqual([1, 5, 9]);
    expect(row.motivosPeso).toEqual(["Retrabalho de copy", "Urgência"]);

    // round-trip via leitura
    const read = await getOperationalCheck(db, row.id);
    expect(read?.gargalos).toEqual(["Copy", "Briefing"]);
    expect(read?.clientesPesadasIds).toEqual([1, 5, 9]);
  });

  it("arrays vazios viram [] na leitura", async () => {
    const row = await createOrUpdateOperationalCheck(db, baseInput());
    expect(row.gargalos).toEqual([]);
    expect(row.clientesPesadasIds).toEqual([]);
    expect(row.motivosPeso).toEqual([]);
  });

  it("guarda carga planejada (numérica) e execução/retrabalho (ordinal qualitativo 1-5)", async () => {
    const row = await createOrUpdateOperationalCheck(
      db,
      baseInput({
        postsTotais: 120,
        unidadesOperacionais: 96.5,
        carrosseis: 40,
        reels: 30,
        estaticos: 50,
        criativosTrafego: 12,
        avulsos: 3,
        entregasExecutadasGabi: 2, // Pouco
        copysDevolvidas: 1, // Nada
        designsRefeitos: 1, // Nada
        postsRevisadosGabi: 4, // Bastante
        postsRevisadosPedro: 3, // Médio
      })
    );
    expect(row.unidadesOperacionais).toBe(96.5);
    expect(row.entregasExecutadasGabi).toBe(2);
    expect(row.postsRevisadosPedro).toBe(3);
  });

  it("rejeita nível qualitativo de execução/retrabalho fora de 1-5", async () => {
    await expect(createOrUpdateOperationalCheck(db, baseInput({ entregasExecutadasGabi: 6 }))).rejects.toThrow();
    await expect(createOrUpdateOperationalCheck(db, baseInput({ postsRevisadosPedro: 0 }))).rejects.toThrow();
  });

  it("rejeita nota fora de 1-5", async () => {
    await expect(createOrUpdateOperationalCheck(db, baseInput({ notaEnergia: 6 }))).rejects.toThrow();
    await expect(createOrUpdateOperationalCheck(db, baseInput({ notaEnergia: 0 }))).rejects.toThrow();
    await expect(createOrUpdateOperationalCheck(db, baseInput({ notaEnergia: 2.5 }))).rejects.toThrow();
  });

  it("rejeita period inválido", async () => {
    await expect(
      createOrUpdateOperationalCheck(db, baseInput({ period: "trimestral" as never }))
    ).rejects.toThrow();
  });

  it("rejeita referenceMonth inválido", async () => {
    await expect(createOrUpdateOperationalCheck(db, baseInput({ referenceMonth: "2026/06" }))).rejects.toThrow();
  });

  it("rejeita mais de 3 gargalos", async () => {
    await expect(
      createOrUpdateOperationalCheck(db, baseInput({ gargalos: ["Copy", "Design", "Atraso", "Revisão"] }))
    ).rejects.toThrow();
  });

  it("rejeita numérico negativo", async () => {
    await expect(createOrUpdateOperationalCheck(db, baseInput({ postsTotais: -1 }))).rejects.toThrow();
  });

  it("upsert: mesmo mês + período atualiza em vez de duplicar", async () => {
    const a = await createOrUpdateOperationalCheck(db, baseInput({ notaEnergia: 2 }));
    const b = await createOrUpdateOperationalCheck(db, baseInput({ notaEnergia: 5 }));
    expect(b.id).toBe(a.id); // mesmo registro
    expect(b.notaEnergia).toBe(5);

    const all = await getOperationalChecks(db);
    expect(all).toHaveLength(1);
  });

  it("upsert: período diferente cria novo registro", async () => {
    await createOrUpdateOperationalCheck(db, baseInput({ period: "meio_mes" }));
    await createOrUpdateOperationalCheck(db, baseInput({ period: "fim_mes" }));
    const all = await getOperationalChecks(db);
    expect(all).toHaveLength(2);
  });
});

describe("getOperationalChecks / delete", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("ordena por mês desc", async () => {
    await createOrUpdateOperationalCheck(db, baseInput({ referenceMonth: "2026-04" }));
    await createOrUpdateOperationalCheck(db, baseInput({ referenceMonth: "2026-06" }));
    await createOrUpdateOperationalCheck(db, baseInput({ referenceMonth: "2026-05" }));
    const all = await getOperationalChecks(db);
    expect(all.map((c) => c.referenceMonth)).toEqual(["2026-06", "2026-05", "2026-04"]);
  });

  it("delete remove o registro", async () => {
    const row = await createOrUpdateOperationalCheck(db, baseInput());
    await deleteOperationalCheck(db, row.id);
    const all = await getOperationalChecks(db);
    expect(all).toHaveLength(0);
  });
});
