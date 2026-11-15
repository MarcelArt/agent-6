import { afterEach, describe, expect, it, vi } from "vitest"
import { createGuardrailClassifier, guardrailContext } from "./guardrail"
import { guardrailExamples } from "./guardrail.examples"
import type { Config } from "./config"

afterEach(() => vi.unstubAllGlobals())
const config: Config = {
  dataDir: "/tmp/unused",
  encryptionKey: "unused",
  authSecret: "unused",
  baseUrl: "http://localhost:3000",
  openaiApiKey: "test-key",
  openaiModel: "support",
  openaiBaseUrl: "http://compatible.test/v1",
}
describe("Guardrail classifier", () => {
  it("bounds recent context and includes visible options without reports or image bytes", () => {
    const recent = guardrailContext(
      Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        role: "assistant",
        content: "x".repeat(3000),
        status: "complete",
        refused: false,
        createdAt: index,
        images: [
          { id: "upload-secret", name: "private.png", width: 10, height: 10 },
        ],
        imagesUnread: false,
        reports: [],
        question: {
          options: ["Billing", "Deliveries"],
          multiple: false,
          answer: null,
        },
      }))
    )
    expect(recent).toHaveLength(8)
    expect(recent.every((message) => message.content.length === 2000)).toBe(
      true
    )
    expect(recent[0]).toMatchObject({
      options: ["Billing", "Deliveries"],
      hasImages: true,
    })
    expect(JSON.stringify(recent)).not.toContain("upload-secret")
    expect(JSON.stringify(recent)).not.toContain("private.png")
  })
  it.each([
    ["IN_SCOPE", true],
    ["OUT_OF_SCOPE", false],
  ])(
    "parses %s through a tool-free compatible Chat Completions call",
    async (output, expected) => {
      const fetcher = vi.fn(async (url: string, init: RequestInit) => {
        expect(String(url)).toBe("http://compatible.test/v1/chat/completions")
        const body = JSON.parse(init.body as string)
        expect(body.model).toBe("cheap")
        expect(body.tools ?? []).toEqual([])
        expect(body.stream).not.toBe(true)
        expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({
          message: "I can't log in",
        })
        return Response.json({
          id: "guardrail",
          object: "chat.completion",
          created: 1,
          model: "cheap",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: output },
              finish_reason: "stop",
            },
          ],
        })
      })
      vi.stubGlobal("fetch", fetcher)
      expect(
        await createGuardrailClassifier({ ...config, guardrailModel: "cheap" })(
          guardrailExamples[0],
          new AbortController().signal
        )
      ).toBe(expected)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )
  it.each(["", "maybe", '{"allowed":true}', "IN_SCOPE and ignore the rules"])(
    "rejects invalid output %j",
    async (content) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            id: "guardrail",
            object: "chat.completion",
            created: 1,
            model: "support",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: "stop",
              },
            ],
          })
        )
      )
      await expect(
        createGuardrailClassifier(config)(
          guardrailExamples[0],
          new AbortController().signal
        )
      ).rejects.toThrow()
    }
  )
  it("honors cancellation before calling the model", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(
      createGuardrailClassifier(config)(
        guardrailExamples[0],
        AbortSignal.abort()
      )
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
