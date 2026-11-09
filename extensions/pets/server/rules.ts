import { z } from "zod";
import { type Db, query, withTransaction } from "@/server/db";
import { writeAudit } from "@/server/repos/audit";
import type { Service } from "@/server/repos/catalog";

// Which service each kind and size of pet gets: the owner's rules, and the
// pure functions that read them.

export type Species = "dog" | "cat";
export type AgeGroup = "young" | "adult";
export type WeightGroup = "small" | "large" | "unknown";
export type PetRequest = "groom" | "nails";

export type ServiceRule = {
  id: number;
  species: Species;
  ageGroup: AgeGroup | null;
  weightGroup: WeightGroup | null;
  request: PetRequest;
  serviceId: number;
};

type Writer = { staffId: number | null; db?: Db };

export async function listServiceRules(db?: Db): Promise<ServiceRule[]> {
  return query<ServiceRule>(
    `select id::int, species, age_group as "ageGroup", weight_group as "weightGroup", request,
       service_id::int as "serviceId"
     from service_rules order by id`,
    [],
    db,
  );
}

export async function setServiceRule(rule: Omit<ServiceRule, "id">, { staffId, db }: Writer): Promise<void> {
  await withTransaction(async (client) => {
    await query(
      `insert into service_rules (species, age_group, weight_group, request, service_id)
       values ($1, $2, $3, $4, $5)
       on conflict (species, age_group, weight_group, request) do update set service_id = excluded.service_id`,
      [rule.species, rule.ageGroup, rule.weightGroup, rule.request, rule.serviceId],
      client,
    );
    await writeAudit(client, { staffId, actor: "staff", entity: "service_rules", action: "set", after: rule });
  }, db);
}



/**
 * What the customer tells us about one pet. Each pet asks for one thing:
 * a groom (which already includes nails) or nails only. There is no way to
 * add a nail trim to a groom.
 */
export const PetDescription = z
  .object({
    species: z.enum(["dog", "cat"]),
    ageGroup: z.enum(["young", "adult"]),
    // Dogs only; a dog without an answer counts as "not sure".
    weightGroup: z.enum(["small", "large", "unknown"]).nullable().default(null),
    request: z.enum(["groom", "nails"]).default("groom"),
  })
  .strict();
export type PetDescription = z.output<typeof PetDescription>;

export type ResolveResult =
  { ok: true; service: Service } | { ok: false; reason: "NoRule" | "NotBookableOnline"; service?: Service };

function matches(rule: ServiceRule, pet: PetDescription, weight: PetDescription["weightGroup"]): boolean {
  return (
    rule.species === pet.species &&
    rule.request === pet.request &&
    (rule.ageGroup === null || rule.ageGroup === pet.ageGroup) &&
    (rule.weightGroup === null || rule.weightGroup === weight)
  );
}

// Age is checked before weight: a rule that names the age beats one that only names the weight.
function specificity(rule: ServiceRule): number {
  return (rule.ageGroup === null ? 0 : 2) + (rule.weightGroup === null ? 0 : 1);
}

/** Picks the service for one pet from the owner's rules. */
export function resolveService(pet: PetDescription, rules: ServiceRule[], services: Service[]): ResolveResult {
  const weight = pet.species === "dog" ? (pet.weightGroup ?? "unknown") : null;
  const best = rules.filter((rule) => matches(rule, pet, weight)).sort((a, b) => specificity(b) - specificity(a))[0];
  const service = best && services.find((candidate) => candidate.id === best.serviceId && candidate.active);
  if (!service) return { ok: false, reason: "NoRule" };
  if (!service.bookableOnline) return { ok: false, reason: "NotBookableOnline", service };
  return { ok: true, service };
}

/** The species a service is for, from the rules that lead to it ("nails only" is for both). */
export function speciesFor(serviceId: number, rules: ServiceRule[]): PetDescription["species"][] {
  const species = new Set(rules.filter((rule) => rule.serviceId === serviceId).map((rule) => rule.species));
  return (["dog", "cat"] as const).filter((candidate) => species.has(candidate));
}

/**
 * The age and weight a chosen service stands for, taken from the most
 * specific rule that leads to it for this species. Null where the service
 * does not say (a cat groom says nothing about weight, "nails only" nothing
 * about age).
 */
export function profileFor(
  serviceId: number,
  species: PetDescription["species"],
  rules: ServiceRule[],
): { ageGroup: PetDescription["ageGroup"] | null; weightGroup: PetDescription["weightGroup"] } {
  const best = rules
    .filter((rule) => rule.serviceId === serviceId && rule.species === species)
    .sort((a, b) => specificity(b) - specificity(a))[0];
  return { ageGroup: best?.ageGroup ?? null, weightGroup: species === "dog" ? (best?.weightGroup ?? null) : null };
}
