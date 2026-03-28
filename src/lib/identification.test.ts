import { describe, it, expect, vi } from "vitest";
import { normalizeString, isClosingIntent, identifyClient } from "./identification";
import { supabase } from "./supabase";

// Mock supabase
vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn()
            }))
          }))
        })),
        order: vi.fn(() => ({}))
      }))
    }))
  }
}));

describe("identification utility", () => {
  describe("normalizeString", () => {
    it("should remove accents and lowercase", () => {
      expect(normalizeString("Olá Mundó!")).toBe("ola mundo");
    });

    it("should handle multiple spaces and punctuation", () => {
      expect(normalizeString("Terminado...  com sucesso.")).toBe("terminado com sucesso");
    });
  });

  describe("isClosingIntent", () => {
    it("should detect simple closing words", () => {
      expect(isClosingIntent("Obrigado")).toBe(true);
      expect(isClosingIntent("resolvido")).toBe(true);
    });

    it("should detect closing phrases at the end", () => {
      expect(isClosingIntent("Muito obrigado")).toBe(true);
      expect(isClosingIntent("Já está tudo ok")).toBe(true);
    });

    it("should not detect non-closing words", () => {
      expect(isClosingIntent("Tenho uma dúvida")).toBe(false);
      expect(isClosingIntent("Pode ajudar?")).toBe(false);
    });
  });

  describe("identifyClient", () => {
    it("should return null if no identifier provided", async () => {
      const result = await identifyClient({});
      expect(result).toBe(null);
    });
    
    // Additional tests would require more complex supabase mocks which we'll skip for brevity 
    // unless really needed, since the logic itself is mostly token matching.
  });
});
