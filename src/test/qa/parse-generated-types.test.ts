import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parseDatabaseContract, parseGeneratedTypesFile } from "./parse-generated-types";

const GENERATED_TYPES_PATH = join(process.cwd(), "src/integrations/supabase/types.ts");

describe("parseDatabaseContract", () => {
  it("extracts table columns and nullability from a minimal fixture", () => {
    const fixture = `
      export type Database = {
        public: {
          Tables: {
            widgets: {
              Row: { id: number; name: string; note: string | null }
              Insert: { id?: number; name: string; note?: string | null }
              Update: { id?: number; name?: string; note?: string | null }
              Relationships: []
            }
          }
          Views: {}
          Functions: {
            do_thing: {
              Args: { p_id: number; p_reason?: string }
              Returns: boolean
            }
          }
          Enums: {}
          CompositeTypes: {}
        }
      }
    `;

    const contract = parseDatabaseContract(fixture, "fixture.ts");

    expect(contract.tables).toHaveLength(1);
    const widgets = contract.tables[0];
    expect(widgets.name).toBe("widgets");
    expect(widgets.columns).toEqual([
      { name: "id", typeText: "number", nullable: false },
      { name: "name", typeText: "string", nullable: false },
      { name: "note", typeText: "string | null", nullable: true },
    ]);

    expect(contract.functions).toHaveLength(1);
    const doThing = contract.functions[0];
    expect(doThing.name).toBe("do_thing");
    expect(doThing.args).toEqual([
      { name: "p_id", typeText: "number", optional: false },
      { name: "p_reason", typeText: "string", optional: true },
    ]);
    expect(doThing.returnsText).toBe("boolean");
  });

  it("returns an empty contract rather than throwing when the shape is unrecognized", () => {
    const contract = parseDatabaseContract("export type Something = { foo: string }", "empty.ts");
    expect(contract).toEqual({ tables: [], functions: [] });
  });

  it("parses the real generated types.ts file and finds known tables/functions", () => {
    const contract = parseGeneratedTypesFile(GENERATED_TYPES_PATH);

    // Sanity bounds: a real parse of this ~73k-line file should find
    // hundreds of tables and functions, not a suspiciously small number
    // that would indicate the parser silently matched the wrong shape.
    expect(contract.tables.length).toBeGreaterThan(50);
    expect(contract.functions.length).toBeGreaterThan(50);

    const tenants = contract.tables.find((t) => t.name === "tenants");
    expect(tenants).toBeDefined();
    expect(tenants?.columns.some((c) => c.name === "id" && !c.nullable)).toBe(true);

    const checkPermission = contract.functions.find((f) => f.name === "check_permission");
    expect(checkPermission).toBeDefined();
    expect(checkPermission?.args).toEqual([
      { name: "p_feature_key", typeText: "string", optional: false },
      { name: "p_min_level", typeText: "string", optional: true },
      { name: "p_user_id", typeText: "string", optional: false },
    ]);
    expect(checkPermission?.returnsText).toBe("boolean");
  });
});
