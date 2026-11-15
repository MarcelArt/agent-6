import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CODE_CAPS, createCodeTools } from "./code-tools"

let directory: string
let code: ReturnType<typeof createCodeTools>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agent6-code-"))
  await mkdir(join(directory, "attached", "src"), { recursive: true })
  await mkdir(join(directory, "unattached"))
  await mkdir(join(directory, "attached", ".git"))
  await writeFile(
    join(directory, "attached", "src", "help.ts"),
    "Open Billing.\nChoose Download invoice.\n"
  )
  await writeFile(join(directory, "unattached", "secret"), "secret")
  await writeFile(join(directory, "attached", ".git", "config"), "secret token")
  await symlink(
    join(directory, "unattached"),
    join(directory, "attached", "escape")
  )
  await symlink(
    join(directory, "unattached", "secret"),
    join(directory, "attached", "secret-link")
  )
  await symlink(
    join(directory, "attached", ".git"),
    join(directory, "attached", "metadata")
  )
  code = createCodeTools([
    { id: "attached", cloneDir: join(directory, "attached") },
  ])
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("read-only code scope", () => {
  const attempts = [
    "../unattached",
    "src/../../unattached",
    "/etc/passwd",
    "src\\..\\..\\unattached",
    "escape",
    "escape/secret",
    "secret-link",
    ".git/config",
    "metadata/config",
    "a\0b",
  ]
  for (const path of attempts)
    it(`refuses ${JSON.stringify(path)} on every code tool`, async () => {
      await expect(
        code.listDirectory({ repositoryId: "attached", path })
      ).rejects.toThrow(/not available/)
      await expect(
        code.searchText({
          repositoryId: "attached",
          path,
          query: "secret",
          maxResults: 5,
        })
      ).rejects.toThrow(/not available/)
      await expect(
        code.readFile({
          repositoryId: "attached",
          path,
          startLine: 1,
          endLine: 2,
        })
      ).rejects.toThrow(/not available/)
    })
  it("cannot select an unattached Repository, even when its clone exists", async () => {
    await expect(
      code.listDirectory({ repositoryId: "unattached", path: "." })
    ).rejects.toThrow()
    await expect(
      code.searchText({
        repositoryId: "unattached",
        path: ".",
        query: "secret",
        maxResults: 5,
      })
    ).rejects.toThrow()
    await expect(
      code.readFile({
        repositoryId: "unattached",
        path: "secret",
        startLine: 1,
        endLine: 2,
      })
    ).rejects.toThrow()
    const results = await code.searchText({
      repositoryId: "attached",
      path: ".",
      query: "secret",
      maxResults: 5,
    })
    expect(results.matches).toEqual([])
  })
  it("uses inclusive line ranges and a directory/file search filter", async () => {
    expect(
      await code.readFile({
        repositoryId: "attached",
        path: "src/help.ts",
        startLine: 2,
        endLine: 2,
      })
    ).toEqual({
      startLine: 2,
      text: "Choose Download invoice.",
      truncated: false,
    })
    expect(
      (
        await code.searchText({
          repositoryId: "attached",
          path: "src",
          query: "Download",
          maxResults: 5,
        })
      ).matches
    ).toEqual([
      { path: "src/help.ts", line: 2, text: "Choose Download invoice." },
    ])
    await expect(
      code.readFile({
        repositoryId: "attached",
        path: "src/help.ts",
        startLine: 0,
        endLine: 2,
      })
    ).rejects.toThrow(/valid line/)
  })
  it("caps read bytes, read lines, search results, and directory entries", async () => {
    await writeFile(
      join(directory, "attached", "long"),
      ("match" + "x".repeat(500) + "\n").repeat(500)
    )
    const read = await code.readFile({
      repositoryId: "attached",
      path: "long",
      startLine: 1,
      endLine: 500,
    })
    expect(Buffer.byteLength(read.text)).toBeLessThanOrEqual(
      CODE_CAPS.outputBytes
    )
    expect(read.text.split("\n").length).toBeLessThanOrEqual(
      CODE_CAPS.readLines
    )
    expect(read.truncated).toBe(true)
    const result = await code.searchText({
      repositoryId: "attached",
      path: ".",
      query: "match",
      maxResults: 999,
    })
    expect(result.matches.length).toBeLessThanOrEqual(CODE_CAPS.searchResults)
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      CODE_CAPS.outputBytes
    )
    expect(result.truncated).toBe(true)
    expect(
      (
        await code.searchText({
          repositoryId: "attached",
          path: ".",
          query: "match",
          maxResults: 2,
        })
      ).matches
    ).toHaveLength(2)
    await Promise.all(
      Array.from({ length: 220 }, (_, i) =>
        writeFile(join(directory, "attached", `file-${i}`), "")
      )
    )
    expect(
      await code.listDirectory({ repositoryId: "attached", path: "." })
    ).toMatchObject({ truncated: true })
    expect(
      (await code.listDirectory({ repositoryId: "attached", path: "." }))
        .entries
    ).toHaveLength(CODE_CAPS.directoryEntries)
  })
  it("refuses huge/binary files and symlinked clone roots", async () => {
    await writeFile(
      join(directory, "attached", "huge"),
      "x".repeat(CODE_CAPS.fileBytes + 1)
    )
    await writeFile(
      join(directory, "attached", "binary"),
      Buffer.from([1, 0, 2])
    )
    for (const path of ["huge", "binary"])
      await expect(
        code.readFile({
          repositoryId: "attached",
          path,
          startLine: 1,
          endLine: 5,
        })
      ).rejects.toThrow(/not a readable/)
    await symlink(join(directory, "unattached"), join(directory, "root-link"))
    const alias = createCodeTools([
      { id: "alias", cloneDir: join(directory, "root-link") },
    ])
    await expect(
      alias.listDirectory({ repositoryId: "alias", path: "." })
    ).rejects.toThrow(/not available/)
  })
})
