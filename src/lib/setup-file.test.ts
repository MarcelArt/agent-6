import { describe, expect, it } from "vitest"
import {
  MAX_SETUP_FILE_BYTES,
  describeCounts,
  leftOutResources,
  parseSetupFile,
  setupFileName,
} from "./setup-file"

const EMPTY = {
  format: "agent6-setup",
  version: 1,
  exportedAt: "2026-11-19T10:00:00.000Z",
  repositories: [],
  databaseConnections: [],
  logConnections: [],
  applications: [],
}

describe("parseSetupFile", () => {
  it("reads a version 1 file", () => {
    expect(parseSetupFile(JSON.stringify(EMPTY))).toEqual({
      ok: true,
      file: EMPTY,
    })
  })
  it.each([
    [JSON.stringify([]), /format is missing/],
    [JSON.stringify({ ...EMPTY, version: "1" }), /no valid version/],
    [JSON.stringify({ ...EMPTY, version: 3 }), /file version 3/],
    [
      JSON.stringify({ ...EMPTY, applications: [{ name: 1 }] }),
      /applications\[0\]\.name: Invalid input/,
    ],
    [
      JSON.stringify({ ...EMPTY, repositories: undefined }),
      /repositories: Invalid input/,
    ],
    [" ".repeat(MAX_SETUP_FILE_BYTES + 1), /larger than 1 MB/],
  ])("names what is wrong with %#", (text, message) => {
    const result = parseSetupFile(text)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(message)
  })
  it("names the file after the export day", () => {
    expect(setupFileName("2026-11-19T23:59:00.000Z")).toBe(
      "agent6-setup-2026-11-19.json"
    )
  })
})

describe("leftOutResources", () => {
  const options = {
    applications: [
      {
        id: "a",
        name: "A",
        repositoryIds: ["r1", "r2"],
        databaseConnectionIds: ["d1"],
        logConnectionIds: [],
      },
      {
        id: "b",
        name: "B",
        repositoryIds: ["r2", "r3"],
        databaseConnectionIds: [],
        logConnectionIds: ["l1"],
      },
    ],
    totals: { repositories: 4, databaseConnections: 1, logConnections: 2 },
  }
  it("counts resources that no chosen Application uses", () => {
    expect(leftOutResources(options, new Set(["a"]))).toEqual({
      repositories: 2,
      databaseConnections: 0,
      logConnections: 2,
    })
    expect(describeCounts(leftOutResources(options, new Set(["a", "b"])))).toBe(
      "1 Repository and 1 Log Connection"
    )
    expect(
      describeCounts({
        repositories: 2,
        databaseConnections: 1,
        logConnections: 3,
      })
    ).toBe("2 Repositories, 1 Database Connection and 3 Log Connections")
  })
})
