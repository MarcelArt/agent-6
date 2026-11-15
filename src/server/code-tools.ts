import "@tanstack/react-start/server-only"

import { constants } from "node:fs"
import { lstat, open, opendir, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

export const CODE_CAPS = {
  directoryEntries: 200,
  searchResults: 50,
  outputBytes: 24_000,
  readLines: 200,
  fileBytes: 1_000_000,
  searchBytes: 4_000_000,
  searchFiles: 1000,
}

export class CodeToolError extends Error {}

/** No shell, network, writes, or paths outside these explicitly attached clones. */
export function createCodeTools(
  repositories: Array<{ id: string; cloneDir: string }>,
  signal?: AbortSignal
) {
  const roots = new Map(repositories.map((item) => [item.id, item.cloneDir]))
  const refused = () =>
    new CodeToolError("That path is not available in this Application.")
  function check() {
    signal?.throwIfAborted()
  }
  async function locate(repositoryId: string, path: string) {
    check()
    const cloneDir = roots.get(repositoryId)
    if (
      !cloneDir ||
      isAbsolute(path) ||
      path.includes("\\") ||
      path.includes("\0")
    )
      throw refused()
    const parts = path.split("/").filter((part) => part && part !== ".")
    if (parts.some((part) => part === ".." || part.toLowerCase() === ".git"))
      throw refused()
    try {
      // Refuse symlinks altogether, including the clone root. This also prevents
      // aliases to .git and recursive directory loops.
      let current = resolve(cloneDir)
      if ((await lstat(current)).isSymbolicLink()) throw refused()
      const root = await realpath(current)
      for (const part of parts) {
        current = join(current, part)
        if ((await lstat(current)).isSymbolicLink()) throw refused()
      }
      const canonical = await realpath(current)
      const fromRoot = relative(root, canonical)
      if (
        isAbsolute(fromRoot) ||
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`)
      )
        throw refused()
      return { path: canonical, relative: parts.join("/") }
    } catch {
      throw refused()
    }
  }
  async function readBounded(path: string): Promise<Buffer | null> {
    check()
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    )
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > CODE_CAPS.fileBytes) return null
      const bytes = Buffer.alloc(
        Math.min(stat.size + 1, CODE_CAPS.fileBytes + 1)
      )
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      if (bytesRead > CODE_CAPS.fileBytes) return null
      const result = bytes.subarray(0, bytesRead)
      return result.includes(0) ? null : result
    } finally {
      await handle.close()
    }
  }
  const fit = (value: string, bytes = CODE_CAPS.outputBytes) =>
    new TextDecoder().decode(Buffer.from(value).subarray(0, bytes), {
      stream: true,
    })
  return {
    async listDirectory(input: { repositoryId: string; path: string }) {
      const directory = await locate(input.repositoryId, input.path)
      const entries: Array<{ name: string; kind: "directory" | "file" }> = []
      let size = 0
      let truncated = false
      for await (const entry of await opendir(directory.path)) {
        check()
        if (
          entry.name.toLowerCase() === ".git" ||
          entry.isSymbolicLink() ||
          (!entry.isFile() && !entry.isDirectory())
        )
          continue
        size += Buffer.byteLength(JSON.stringify(entry.name)) + 50
        if (
          entries.length >= CODE_CAPS.directoryEntries ||
          size > CODE_CAPS.outputBytes
        ) {
          truncated = true
          break
        }
        entries.push({
          name: entry.name,
          kind: entry.isDirectory() ? "directory" : "file",
        })
      }
      return { entries, truncated }
    },
    async readFile(input: {
      repositoryId: string
      path: string
      startLine: number
      endLine: number
    }) {
      const file = await locate(input.repositoryId, input.path)
      if (
        !Number.isInteger(input.startLine) ||
        input.startLine < 1 ||
        !Number.isInteger(input.endLine) ||
        input.endLine < input.startLine
      )
        throw new CodeToolError(
          "Choose a valid line range, starting at line 1."
        )
      const bytes = await readBounded(file.path)
      if (!bytes)
        throw new CodeToolError(
          "This file is too large or is not a readable text file. Search for a smaller file instead."
        )
      const lines = bytes.toString("utf8").split("\n")
      const endLine = Math.min(
        input.endLine,
        input.startLine + CODE_CAPS.readLines - 1
      )
      const requested = lines.slice(input.startLine - 1, endLine).join("\n")
      return {
        startLine: input.startLine,
        text: fit(requested),
        truncated:
          input.endLine > endLine ||
          Buffer.byteLength(requested) > CODE_CAPS.outputBytes,
      }
    },
    async searchText(input: {
      repositoryId: string
      path: string
      query: string
      maxResults: number
    }) {
      const start = await locate(input.repositoryId, input.path)
      if (!input.query.trim() || input.query.length > 500)
        throw new CodeToolError(
          "Search for between 1 and 500 characters of literal text."
        )
      const limit = Math.max(
        1,
        Math.min(
          CODE_CAPS.searchResults,
          Math.floor(input.maxResults) || CODE_CAPS.searchResults
        )
      )
      const matches: Array<{ path: string; line: number; text: string }> = []
      let files = 0,
        scanned = 0,
        output = 0,
        visited = 0,
        truncated = false
      async function walk(path: string, display: string): Promise<void> {
        check()
        if (
          ++visited > 3000 ||
          files >= CODE_CAPS.searchFiles ||
          scanned >= CODE_CAPS.searchBytes ||
          matches.length >= limit ||
          output >= CODE_CAPS.outputBytes - 1500
        ) {
          truncated = true
          return
        }
        const stat = await lstat(path)
        if (stat.isSymbolicLink()) return
        if (stat.isDirectory()) {
          for await (const entry of await opendir(path)) {
            if (entry.name.toLowerCase() === ".git" || entry.isSymbolicLink())
              continue
            await walk(
              join(path, entry.name),
              display ? `${display}/${entry.name}` : entry.name
            )
            if (truncated) break
          }
        } else if (stat.isFile()) {
          files++
          if (stat.size > CODE_CAPS.searchBytes - scanned) {
            truncated = true
            return
          }
          const bytes = await readBounded(path)
          scanned += stat.size
          if (!bytes) return
          const lines = bytes.toString("utf8").split("\n")
          for (let index = 0; index < lines.length; index++) {
            if (!lines[index].includes(input.query)) continue
            const match = {
              path: display,
              line: index + 1,
              text: fit(lines[index], 800),
            }
            const size = Buffer.byteLength(JSON.stringify(match))
            if (
              matches.length >= limit ||
              output + size > CODE_CAPS.outputBytes - 100
            ) {
              truncated = true
              break
            }
            matches.push(match)
            output += size
          }
        }
      }
      await walk(start.path, start.relative)
      return { matches, truncated }
    },
  }
}
