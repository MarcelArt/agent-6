import "@tanstack/react-start/server-only"

/**
 * A safety net under the agent's own redaction: blanks what looks like an
 * email address, a phone number or a credential. Names cannot be recognised
 * here; the agent instructions cover those.
 */
export function redact(text: string) {
  return (
    text
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        "[redacted key]"
      )
      // Connection strings: keep the host, drop the credentials.
      .replace(
        /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
        "$1[redacted]@"
      )
      // Bounded email components avoid quadratic backtracking on long code/log tokens.
      .replace(
        /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g,
        "[redacted email]"
      )
      .replace(
        /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[\w-]{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,})/g,
        "[redacted token]"
      )
      .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{12,}/gi, "$1 [redacted]")
      .replace(
        /\b(pass(?:word|wd)?|secret|token|api[_-]?key|authorization)\b(["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;)}\]]+)/gi,
        (match, name: string, separator: string, value: string) =>
          // `token = $1` or `password = ?` in a query is not a secret.
          /^["']?(\$\d+|\?|null|true|false|\[redacted.*)?["']?$/i.test(value)
            ? match
            : `${name}${separator}[redacted]`
      )
      // Country codes never start with 0, which spares "+07:00" and "+0700".
      .replace(
        /(?<![\w+])\+[1-9]\d{0,2}[ -]?\(?\d{2,4}\)?(?:[ -]?\d{2,4}){2,3}\b/g,
        "[redacted phone]"
      )
  )
}
