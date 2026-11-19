import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createDecisionSession,
  decisionHistory,
  requestDecisions,
} from "./decision-ai"
import { parseDecisionConfig } from "./decision-config"
import type { DecisionAnswer, DecisionQuestion } from "./decision-ai"
import type { DecisionConfig, DecisionProvider } from "./decision-config"
import type { ApplicationScope } from "@/lib/applications"
import type { ToolActivity } from "@/lib/conversation-history"

const config = (
  provider: DecisionProvider = "typesafe"
): Extract<DecisionConfig, { status: "configured" }> => ({
  status: "configured",
  provider,
  apiKey: "private-fixture-key",
  model:
    provider === "cloudflare"
      ? "@cf/cloudflare/clef"
      : provider === "openai"
        ? "gpt-6-luna"
        : "jev-latest",
  baseUrl: "http://decision.test/v1",
  minProbability: 0.7,
  minMargin: 0.15,
})
const scope: ApplicationScope = {
  application: { id: "app", name: "Portal", description: "Billing", notes: "" },
  attachments: ["frontend", "backend"].map((id) => ({
    kind: "repository",
    resource: {
      id,
      fullName: `org/${id}`,
      trackedBranch: "main",
      description: id,
      tags: [],
      status: "ready",
      error: null,
      syncStartedAt: null,
      lastSyncedAt: 1,
      lastSyncedCommit: "abc",
    },
  })),
}
const questions: DecisionQuestion[] = [
  { name: "relevant", type: "predicate", instructions: "Is this relevant?" },
  {
    name: "kind",
    type: "choice",
    instructions: "Which kind?",
    choices: { code: "Code", data: "Data" },
  },
]
const wireChoice = {
  type: "choice",
  choice: "code",
  confidence: 0.8,
  probabilities: { code: 0.9, data: 0.1 },
}
const pred = (p: number): DecisionAnswer => ({
  type: "predicate",
  probability: p,
})
const choice = (
  selected: string,
  probabilities: Record<string, number>
): DecisionAnswer => ({
  type: "choice",
  choice: selected,
  confidence: 0.8,
  probabilities,
})
afterEach(() => vi.restoreAllMocks())

describe("Decision AI environment", () => {
  it("stays absent without configuration and treats partial, unsafe or invalid configuration as unavailable", () => {
    expect(parseDecisionConfig({})).toBeUndefined()
    expect(parseDecisionConfig({ DECISION_AI_PROVIDER: " " })).toBeUndefined()
    for (const extra of [
      { DECISION_AI_PROVIDER: "unknown" },
      { DECISION_AI_BASE_URL: "file:///private" },
      { DECISION_AI_MIN_PROBABILITY: "NaN" },
      { DECISION_AI_MIN_MARGIN: "2" },
      { DECISION_AI_BASE_URL: "https://secret:password@example.com" },
    ]) {
      const result = parseDecisionConfig({
        DECISION_AI_PROVIDER: "typesafe",
        DECISION_AI_API_KEY: "private-fixture-key",
        DECISION_AI_MODEL: "jev-latest",
        ...extra,
      })
      expect(result?.status).toBe("invalid")
      expect(JSON.stringify(result)).not.toContain("private-fixture-key")
      expect(JSON.stringify(result)).not.toContain("secret:password")
    }
    expect(parseDecisionConfig({ DECISION_AI_API_KEY: "key" })?.status).toBe(
      "invalid"
    )
  })
  it("builds one independent provider configuration including Cloudflare account routing", () => {
    expect(
      parseDecisionConfig({
        DECISION_AI_PROVIDER: "cloudflare",
        DECISION_AI_API_KEY: "key",
        DECISION_AI_MODEL: "@cf/cloudflare/clef",
        DECISION_AI_ACCOUNT_ID: "account123",
        DECISION_AI_MIN_PROBABILITY: "0.8",
      })
    ).toMatchObject({
      status: "configured",
      baseUrl:
        "https://api.cloudflare.com/client/v4/accounts/account123/ai/run",
      minProbability: 0.8,
    })
  })
})

describe("Decision provider contracts", () => {
  it("redacts evidence and choice descriptions before serialization without breaking JSON", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(init!.body as string)
        expect(JSON.parse(body.input)).toMatchObject({
          question: expect.stringContaining("[redacted]"),
        })
        expect(init!.body).not.toContain("private-password")
        expect(init!.body).not.toContain("private@example.com")
        expect(init!.body).not.toContain("IMAGE_BYTES")
        return Response.json({
          answers: [
            {
              name: "kind",
              ...wireChoice,
              probabilities: [
                { value: "code", probability: 0.9 },
                { value: "data", probability: 0.1 },
              ],
            },
          ],
        })
      })
    await requestDecisions(
      config("openai"),
      {
        question: 'password: "private-password"',
        picture: "data:image/png;base64,IMAGE_BYTES",
      },
      [
        {
          name: "kind",
          type: "choice",
          instructions: "Classify the evidence",
          choices: { code: "Contact private@example.com", data: "Data" },
        },
      ],
      new AbortController().signal
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(["typesafe", "cloudflare", "openai"] as const)(
    "uses the native %s protocol and normalizes typed answers",
    async (provider) => {
      const fetcher = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
          const body = JSON.parse(init!.body as string)
          expect(init?.headers).toMatchObject({
            Authorization: "Bearer private-fixture-key",
          })
          expect(init?.redirect).toBe("error")
          expect(body).not.toHaveProperty("messages")
          if (provider === "openai") {
            expect(String(url)).toBe("http://decision.test/v1/decisions")
            expect(body.input).toBe(JSON.stringify({ question: "invoice" }))
            expect(body.questions[1].choices).toEqual([
              { value: "code", description: "Code" },
              { value: "data", description: "Data" },
            ])
            return Response.json({
              answers: [
                { name: "relevant", type: "predicate", probability: 0.95 },
                {
                  name: "kind",
                  ...wireChoice,
                  probabilities: [
                    { value: "code", probability: 0.9 },
                    { value: "data", probability: 0.1 },
                  ],
                },
              ],
            })
          }
          expect(String(url)).toBe(
            `http://decision.test/v1/${provider === "typesafe" ? "systemone" : "@cf/cloudflare/clef"}`
          )
          expect(body.questions.relevant.type).toBe("noul")
          expect(body.questions.kind.criteria).toEqual({
            code: "Code",
            data: "Data",
          })
          expect(body.model).toBe(
            provider === "typesafe" ? "jev-latest" : "clef"
          )
          const result = {
            answers: {
              relevant: { type: "noul", noul: 0.95 },
              kind: wireChoice,
            },
          }
          return Response.json(
            provider === "cloudflare" ? { success: true, result } : result
          )
        })
      expect(
        await requestDecisions(
          config(provider),
          { question: "invoice" },
          questions,
          new AbortController().signal
        )
      ).toEqual({ relevant: pred(0.95), kind: wireChoice })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )
  it("rejects unknown targets, missing answers and invalid probabilities", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
    for (const answer of [
      { ...wireChoice, choice: "outside-application" },
      { ...wireChoice, probabilities: { code: 1.4, data: -0.4 } },
      { ...wireChoice, probabilities: { code: 0.4, data: 0.1 } },
      { ...wireChoice, probabilities: { code: 0.1, data: 0.9 } },
      undefined,
    ]) {
      fetcher.mockResolvedValueOnce(
        Response.json({
          answers: {
            relevant: { type: "noul", noul: 0.95 },
            ...(answer ? { kind: answer } : {}),
          },
        })
      )
      await expect(
        requestDecisions(config(), {}, questions, new AbortController().signal)
      ).rejects.toThrow()
    }
  })
  it("bounds request and response sizes, refuses redirects, and never exposes error bodies", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
    await expect(
      requestDecisions(
        config(),
        "x".repeat(66000),
        questions,
        new AbortController().signal
      )
    ).rejects.toThrow(/size limit/)
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValueOnce(
      new Response("private error", { status: 401 })
    )
    await expect(
      requestDecisions(config(), {}, questions, new AbortController().signal)
    ).rejects.toThrow("Provider returned HTTP 401.")
    fetcher.mockResolvedValueOnce(new Response("x".repeat(132000)))
    await expect(
      requestDecisions(config(), {}, questions, new AbortController().signal)
    ).rejects.toThrow(/size limit/)
  })
})

describe("Advisory decisions", () => {
  it("selects databases and logs using purpose metadata without connection details", async () => {
    const attachedScope: ApplicationScope = {
      ...scope,
      attachments: [
        ...scope.attachments,
        {
          kind: "database-connection",
          resource: {
            id: "db",
            name: "Billing records",
            description: "Invoices",
            tags: ["billing"],
            host: "private-db.internal",
            port: 5432,
            database: "internal",
            user: "private-user",
            sslMode: "verify-full",
            test: { ok: true, message: "", writable: false },
            needsSecret: false,
          },
        },
        {
          kind: "log-connection",
          baseSelector: '{app="private-service"}',
          resource: {
            id: "logs",
            name: "Billing events",
            description: "Errors",
            tags: ["billing"],
            baseUrl: "https://private-loki.internal",
            authType: "bearer",
            authUsername: "private-user",
            tenantId: "private-tenant",
            test: { ok: true, message: "" },
            needsSecret: false,
          },
        },
      ],
    }
    const request = vi.fn<typeof requestDecisions>().mockResolvedValue({
      r0: pred(0.1),
      r1: pred(0.2),
      r2: pred(0.95),
      r3: pred(0.9),
    })
    const advice = await createDecisionSession({
      config: config(),
      scope: attachedScope,
      history: [],
      question: "Invoice error",
      signal: new AbortController().signal,
      request,
    }).resources()
    expect(advice).toMatchObject({
      resources: [
        { kind: "database-connection", id: "db", probability: 0.95 },
        { kind: "log-connection", id: "logs", probability: 0.9 },
      ],
    })
    const input = JSON.stringify(request.mock.calls[0][1])
    expect(input).toContain("Invoices")
    expect(input).not.toContain("private-")
  })
  function session(
    request: typeof requestDecisions,
    extra: Partial<Parameters<typeof createDecisionSession>[0]> = {}
  ) {
    return createDecisionSession({
      config: config(),
      scope,
      question: "Invoice fails",
      history: [],
      signal: new AbortController().signal,
      request,
      ...extra,
    })
  }
  it("ranks multiple relevant resources and preserves uncertain and empty results", async () => {
    const request = vi
      .fn<typeof requestDecisions>()
      .mockResolvedValueOnce({ r0: pred(0.8), r1: pred(0.95) })
      .mockResolvedValueOnce({ r0: pred(0.1), r1: pred(0.5) })
    const decisions = session(request)
    expect(await decisions.resources()).toEqual({
      resources: [
        { kind: "repository", id: "backend", probability: 0.95 },
        { kind: "repository", id: "frontend", probability: 0.8 },
      ],
      uncertain: false,
    })
    expect(await decisions.resources("New evidence")).toEqual({
      resources: [],
      uncertain: true,
    })
    expect(scope.attachments).toHaveLength(2)
  })
  it("uses top probability and margin, supports no-fix, and does not confuse confidence with probability", async () => {
    const request = vi
      .fn<typeof requestDecisions>()
      .mockResolvedValueOnce({
        classification: choice("code-fix", {
          "code-fix": 0.9,
          "data-fix": 0.1,
        }),
        destination: choice("r1", { r1: 0.95, r0: 0.04, unknown: 0.01 }),
      })
      .mockResolvedValueOnce({
        classification: choice("data-fix", {
          "data-fix": 0.6,
          "code-fix": 0.4,
        }),
        destination: { type: "refusal" },
      })
      .mockResolvedValueOnce({
        classification: choice("no-fix", {
          "no-fix": 0.95,
          "insufficient-evidence": 0.05,
        }),
        destination: choice("unknown", { unknown: 0.95, r1: 0.05 }),
      })
    const decisions = session(request)
    expect(await decisions.fault("Code evidence")).toMatchObject({
      classification: "code-fix",
      repositoryId: "backend",
      uncertain: false,
    })
    expect(await decisions.fault("Incomplete evidence")).toMatchObject({
      uncertain: true,
      classification: undefined,
      repositoryId: undefined,
    })
    expect(await decisions.fault("Guidance")).toMatchObject({
      classification: "no-fix",
      uncertain: false,
    })
  })
  it("stops after four serialized requests and after the first operational failure", async () => {
    const request = vi
      .fn<typeof requestDecisions>()
      .mockResolvedValue({ r0: pred(0.8), r1: pred(0.9) })
    const decisions = session(request)
    const results = await Promise.all(
      Array.from({ length: 5 }, () => decisions.resources())
    )
    expect(request).toHaveBeenCalledTimes(4)
    expect(results[4]).toMatchObject({
      fallback: expect.stringMatching(/budget/),
    })
    const failed = vi
      .fn<typeof requestDecisions>()
      .mockRejectedValue(new Error("secret provider error"))
    const failing = session(failed)
    expect(await failing.resources()).toMatchObject({
      fallback: expect.stringMatching(/failed/),
    })
    expect(await failing.fault("evidence")).toMatchObject({
      fallback: expect.stringMatching(/already failed/),
    })
    expect(failed).toHaveBeenCalledTimes(1)
  })
  it("enforces the aggregate waiting budget", async () => {
    let clock = 0
    vi.spyOn(performance, "now").mockImplementation(() => clock)
    const request = vi
      .fn<typeof requestDecisions>()
      .mockImplementation(async () => {
        clock += 3000
        return { r0: pred(0.8), r1: pred(0.9) }
      })
    const decisions = session(request)
    await decisions.resources()
    await decisions.resources()
    expect(await decisions.resources()).toMatchObject({
      fallback: expect.stringMatching(/budget/),
    })
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("propagates cancellation instead of continuing the reply", async () => {
    const abort = new AbortController()
    const request = vi
      .fn<typeof requestDecisions>()
      .mockImplementation(() => new Promise(() => {}))
    const pending = session(request, { signal: abort.signal }).resources()
    await Promise.resolve()
    abort.abort(new Error("user cancelled"))
    await expect(pending).rejects.toThrow("user cancelled")
  })
  it("times out a provider without depending on the provider honoring AbortSignal", async () => {
    const request = vi
      .fn<typeof requestDecisions>()
      .mockImplementation(() => new Promise(() => {}))
    const decisions = session(request)
    expect(await decisions.resources()).toMatchObject({
      fallback: expect.stringMatching(/timed out/),
    })
    await decisions.resources()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("skips oversized candidate sets without silently removing resources", async () => {
    const request = vi.fn<typeof requestDecisions>()
    const largeScope = {
      ...scope,
      attachments: Array.from({ length: 65 }, () => scope.attachments[0]),
    }
    expect(
      await session(request, {
        config: config("cloudflare"),
        scope: largeScope,
      }).resources()
    ).toMatchObject({ fallback: expect.stringMatching(/Candidate count/) })
    expect(request).not.toHaveBeenCalled()
  })
  it("sends bounded redacted text and safe metadata, and audits only normalized summaries", async () => {
    const activities: ToolActivity[] = []
    const request = vi.fn<typeof requestDecisions>().mockResolvedValue({
      classification: choice("code-fix", {
        "code-fix": 0.95,
        "data-fix": 0.05,
      }),
      destination: choice("r1", { r1: 0.95, unknown: 0.05 }),
    })
    const decisions = session(request, {
      history: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "user@example.com" },
            {
              type: "input_image",
              image: "data:image/png;base64,SECRET_IMAGE",
            },
          ],
        },
        { type: "reasoning", content: "PRIVATE_REASONING" },
        { type: "function_call_result", output: "RAW_DATABASE_ROWS" },
      ],
      onActivity: (a) => activities.push(a),
    })
    await decisions.fault(
      `password=secret-password\nEVIDENCE_ONLY\n${"x".repeat(20000)}`
    )
    const sent = JSON.stringify(request.mock.calls[0][1])
    expect(sent).not.toContain("SECRET_IMAGE")
    expect(sent).not.toContain("user@example.com")
    expect(sent).not.toContain("RAW_DATABASE_ROWS")
    expect(sent).not.toContain("PRIVATE_REASONING")
    expect(sent).not.toContain("secret-password")
    expect(
      Buffer.byteLength(
        (request.mock.calls[0][1] as { evidence: string }).evidence
      )
    ).toBeLessThanOrEqual(16384)
    const audit = JSON.stringify(activities)
    expect(audit).toContain("backend")
    expect(audit).not.toContain("EVIDENCE_ONLY")
    expect(audit).not.toContain("private-fixture-key")
  })
  it("selects no more than six text messages from history", () => {
    expect(
      decisionHistory(
        Array.from({ length: 10 }, (_, n) => ({
          role: "user",
          content: `Message ${n}`,
        }))
      )
    ).toHaveLength(6)
  })
})
