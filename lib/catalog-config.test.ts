import { describe, expect, test } from "bun:test";
import { extractEcsVisibilityConfig, getFlavorGeneration } from "@/lib/catalog-config";
import type { ProductFlavor } from "@/lib/catalog";

describe("catalog visibility config", () => {
  test("extractEcsVisibilityConfig reads the ECS generation allowlist", () => {
    const configScript = `
      window.defaultConfig = {
        components: [{
          id: 'calculator_ecs_radio',
          sortMethods: {
            1: ['generalComputing'],
            2: ['X1', 'T6', 'S7', 'calc_ignore_me'],
          },
          titleTips: []
        }]
      };
    `;

    expect(extractEcsVisibilityConfig(configScript)).toEqual({
      allowedGenerations: ["X1", "T6", "S7"],
    });
  });

  test("getFlavorGeneration prefers the API generation field and falls back to flavor code", () => {
    expect(getFlavorGeneration({
      resourceSpecCode: "t7.medium.2",
      generation: "T7",
    } satisfies ProductFlavor)).toBe("T7");

    expect(getFlavorGeneration({
      resourceSpecCode: "c7.large.2",
    } satisfies ProductFlavor)).toBe("C7");
  });
});
