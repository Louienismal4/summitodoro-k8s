import { describe, expect, it, vi } from "vitest";

import { createUuid } from "@/lib/uuid";

describe("createUuid", () => {
  it("uses crypto.randomUUID when it is available", () => {
    const randomUUID = vi.fn(() => "test-id");
    vi.stubGlobal("crypto", { randomUUID });

    expect(createUuid()).toBe("test-id");
    expect(randomUUID).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("creates a valid version 4 UUID when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint8Array) => values.fill(0),
    });

    expect(createUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    vi.unstubAllGlobals();
  });
});
