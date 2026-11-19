# Setup Files never carry connection secrets

A Setup File moves chosen Applications and their attached Repositories, Database Connections and Log Connections to another Agent 6 instance. It never contains a Database Connection password or a Log Connection's basic or bearer secret, in any form; it records only whether the source connection had one. An imported connection that had a secret arrives Needs Secret: it is left out of every Application's scope, and the agent cannot use it until an Admin enters the secret on the target instance.

## Considered Options

- **Secrets encrypted with an export passphrase**, re-encrypted with the target's `ENCRYPTION_KEY` on import. Rejected: the file is downloaded through the browser and tends to be shared in chat or committed to git. A leaked file can be attacked offline against a passphrase an Admin chose, and connection credentials would leave the server, which every other path forbids.
- **The source's `ENCRYPTION_KEY` ciphertext.** Rejected: it works only between instances that share the key, which is what the full-volume backup already does.
- **An Admin's choice per export.** Rejected: two kinds of file with different handling rules, to save re-entering a handful of secrets.

## Consequences

- Moving an instance through a Setup File means entering each connection secret once more. The full-volume backup remains the way to move everything, secrets included, between instances that share `ENCRYPTION_KEY`.
- Needs Secret is separate from a failing connection test. A connection whose test fails stays in scope; a connection that needs its secret does not.
