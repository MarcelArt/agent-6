import "@tanstack/react-start/server-only"

import { execFile } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"
import { devNull } from "node:os"
import { join } from "node:path"

/*
 * Clones are made by the `git` program (the deployment image must have it).
 *
 * The token reaches git as an Authorization header set through environment
 * variables of the single command. It is never part of the address, the
 * command line or the clone's `.git/config`.
 */

/** A sync that failed, in words for the Admin. Never contains the token. */
export class GitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GitError"
  }
}

export type Git = {
  /**
   * Makes `dir` a shallow checkout of the tip of `branch` at `url`, creating
   * the clone if needed. Answers the commit it checked out.
   */
  sync: (options: {
    dir: string
    url: string
    branch: string
    signal?: AbortSignal
  }) => Promise<string>
}

/** The local ref the Tracked Branch is fetched into. */
const TRACKED_REF = "refs/agent6/tracked"
const TIMEOUT_MS = 15 * 60 * 1000

export function createGit(token?: string): Git {
  const basic = token
    ? Buffer.from(`x-access-token:${token}`).toString("base64")
    : undefined
  const secrets = [token, basic].filter(
    (secret): secret is string => secret !== undefined
  )

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: "C",
    // Never wait for someone to type a password.
    GIT_TERMINAL_PROMPT: "0",
    // Ignore the machine's and the user's git settings and credential helpers.
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
    ...(basic && {
      GIT_CONFIG_COUNT: "1",
      // Only requests to github.com carry the header.
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    }),
  }

  function redact(text: string): string {
    return secrets.reduce(
      (result, secret) => result.replaceAll(secret, "***"),
      text
    )
  }

  function run(
    cwd: string,
    args: Array<string>,
    signal?: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        "git",
        args,
        { cwd, env, signal, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout.trim())
          const fail = () =>
            reject(new GitError(explain(error, redact(String(stderr)))))
          // Abort invokes the callback before git exits. Wait before reusing the clone.
          if (child.exitCode === null && child.signalCode === null)
            child.once("close", fail)
          else fail()
        }
      )
    })
  }

  return {
    async sync({ dir, url, branch, signal }) {
      await mkdir(dir, { recursive: true })
      // One process and one sync per clone: these can only be left by a killed git.
      for (const lock of [
        "index.lock",
        "config.lock",
        "shallow.lock",
        "HEAD.lock",
        "packed-refs.lock",
        "FETCH_HEAD.lock",
        "refs/agent6/tracked.lock",
      ])
        await rm(join(dir, ".git", lock), { force: true })
      // Reinitializing is safe for an existing clone and repairs a killed first init.
      await run(dir, ["init", "--quiet"], signal)
      try {
        await run(
          dir,
          [
            "fetch",
            "--quiet",
            "--depth=1",
            "--no-tags",
            "--force",
            url,
            `+refs/heads/${branch}:${TRACKED_REF}`,
          ],
          signal
        )
      } catch (error) {
        if (
          error instanceof GitError &&
          /couldn't find remote ref/i.test(error.message)
        ) {
          throw new GitError(
            `The branch ${branch} does not exist on GitHub any more. Pick another Tracked Branch.`
          )
        }
        throw error
      }
      await run(
        dir,
        ["checkout", "--quiet", "--force", "--detach", TRACKED_REF],
        signal
      )
      // Remove files that are no longer in the branch.
      await run(dir, ["clean", "--quiet", "-ffdx"], signal)
      const commit = await run(dir, ["rev-parse", "HEAD"], signal)
      // Drop the commits of earlier syncs now and then. Not worth failing for.
      await run(
        dir,
        [
          "-c",
          "gc.autoDetach=false",
          "-c",
          "gc.reflogExpire=now",
          "-c",
          "gc.pruneExpire=now",
          "gc",
          "--auto",
          "--quiet",
        ],
        signal
      ).catch(() => undefined)
      return commit
    },
  }
}

/** Turns a failed git command into one or two plain sentences. */
function explain(
  error: Error & { code?: unknown; killed?: boolean },
  stderr: string
): string {
  if (error.code === "ENOENT") {
    return "The git program is not installed on the server, so Agent 6 cannot clone. Install git, then sync again."
  }
  if (error.name === "AbortError") return "The sync was stopped."
  if (error.killed) {
    return "The sync took longer than 15 minutes and was stopped. Try again."
  }
  if (
    /authentication failed|could not read username|repository not found|returned error: 40[134]/i.test(
      stderr
    )
  ) {
    return "The GitHub token cannot read this repository. Give the token read access to its contents, then sync again."
  }
  if (/could not resolve host|failed to connect|timed out/i.test(stderr)) {
    return "GitHub could not be reached from the server. Check its network connection, then sync again."
  }
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(fatal|error):/.test(line))
  const text = (lines.length > 0 ? lines.join(" ") : stderr.trim()).slice(
    0,
    400
  )
  return text ? `git failed: ${text}` : "git failed without saying why."
}
