# 21 Setup File

Read [00-README.md](00-README.md) first. Design confirmed on 2026-11-19.

## Goal

An Admin exports chosen Applications, with the Repositories, Database Connections and Log Connections attached to them, as a Setup File, and imports it into another Agent 6 instance, or into an instance with existing setup. The file never holds secrets: imported connections that had one arrive Needs Secret, and the agent cannot use them until an Admin enters it ([ADR 0005](../adr/0005-setup-file-without-secrets.md)).

The full-volume backup in `docs/setup.md` stays the way to restore a whole instance. A Setup File is not configuration as code: an import only adds records and Attachments, and never edits or removes existing setup.

## Depends on

05, 06, 08 and 09.

## Scope

### File

One JSON file, `agent6-setup-YYYY-MM-DD.json`. Records refer to each other by their natural identity, never by instance ids:

```json
{
  "format": "agent6-setup",
  "version": 1,
  "exportedAt": "2026-11-19T10:00:00.000Z",
  "repositories": [
    {
      "fullName": "acme/billing-api",
      "trackedBranch": "main",
      "tags": ["backend"],
      "description": ""
    }
  ],
  "databaseConnections": [
    {
      "name": "Billing production",
      "host": "db.internal",
      "port": 5432,
      "database": "billing",
      "user": "agent6_reader",
      "sslMode": "require",
      "hasPassword": true,
      "tags": [],
      "description": ""
    }
  ],
  "logConnections": [
    {
      "name": "Loki",
      "baseUrl": "https://loki.internal",
      "authType": "bearer",
      "authUsername": "",
      "tenantId": "",
      "tags": [],
      "description": ""
    }
  ],
  "applications": [
    {
      "name": "Billing",
      "description": "",
      "notes": "",
      "repositories": ["acme/billing-api"],
      "databaseConnections": [
        {
          "host": "db.internal",
          "port": 5432,
          "database": "billing",
          "user": "agent6_reader"
        }
      ],
      "logConnections": [
        {
          "baseUrl": "https://loki.internal",
          "tenantId": "",
          "baseSelector": "{app=\"billing\"}"
        }
      ]
    }
  ]
}
```

- The file schema and its parser live in `src/lib/` so the browser and the server share them. Import rejects another `format`, a newer `version`, a file over 1 MB and any JSON that does not match the schema, with a message naming what is wrong. Later versions keep reading older ones.
- Natural identity: a Repository by `owner/name` as GitHub spells it now (a renamed repository matches its new name); a Database Connection by host (ignoring case), port, database and user; a Log Connection by its stored base URL (in the form `validInput` produces) and tenant ID; an Application by its name, trimmed and ignoring case.
- Never in the file: connection secrets, sync status and commit, test results, the writable flag, ids, timestamps, users, Conversations, Tickets, Filed Issues and settings. `hasPassword` records only whether a Database Connection's password was non-empty. A Log Connection's auth type other than `none` already implies a secret.

### Export

- **Export** is a header action on the Applications list. It opens a dialog (`/admin/applications?dialog=export`) listing every Application with a checkbox, none chosen, and a **Select all** checkbox.
- The file holds the chosen Applications and every Repository, Database Connection and Log Connection attached to at least one of them, with those Applications' Attachments and Base Selectors. Resources not attached to a chosen Application are left out; the dialog says how many.
- Export refuses, naming the records, when two chosen Applications share a name or two included connections share a natural identity. Import would reject that file.
- The server builds the file; the browser only saves it. Export needs an Admin.

### Import

- **Import** is a header action on the Applications list. It opens a dialog (`/admin/applications?dialog=import`) that takes one file and shows a preview without writing anything. The uploaded file is not kept: reloading discards the preview and shows the upload step again.
- The preview lists every record in the file as **new** or **existing, reused**, and for each Application the Attachments it will gain. Attachments added to an existing Application are called out, since they widen what the agent can read for it.
- An existing record is reused unchanged. Its name, Tracked Branch, Tags, description, notes and connection settings stay as they are, and the preview names any field where the file differs. An existing Log Attachment keeps its Base Selector, and the preview shows both.
- Each record gets the validation manual creation applies: the shared `validInput` rules, Base Selector parsing, a configured GitHub token that can read each new Repository, and the Tracked Branch existing on GitHub. Two existing Applications with the file's Application name, and two records in the file with one natural identity, are invalid too. Share the GitHub lookup and branch checks with `repository-management.ts`; do not copy them.
- **Any invalid record blocks the whole import.** The preview lists each problem with what to do, and Confirm stays disabled. The Admin fixes the instance or the file and uploads again.
- Confirm sends the file again. The server repeats every check, running the GitHub checks before opening the transaction, and writes all new records and Attachments in one transaction. If anything became invalid, nothing is written and the new preview is shown.
- After the commit, new Repositories start syncing, and new connections that need no secret (a Database Connection without a password, a Log Connection with auth type `none`) are tested. The dialog closes on the Applications list with a summary of what was created, reused and attached.
- An import needs an Admin at the server boundary. Importing the same file twice creates nothing the second time.

### Needs Secret

- A Database Connection imported with `hasPassword: true` and a Log Connection imported with auth type `basic` or `bearer` are stored without a secret. Make `database_connection.encrypted_password` nullable, and run `npm run db:generate`. A null password means Needs Secret. An empty password is stored encrypted as today. For a Log Connection, an auth type other than `none` with a null secret means Needs Secret. Their test result says the secret must be entered.
- `getApplicationScope` leaves out Needs Secret connections, so the agent's tools and Decision AI never receive them. Check that nothing else gives the model attached connections without going through scope.
- A **Needs secret** badge shows on the connection's row in the Database Connections and Log Connections lists, in its detail header and on its Attachment row on the Application's screen. The two nav items show a count, through the nav badge mechanism the pending Ticket count uses.
- Saving the connection with a secret clears the state, and the usual connection test runs and records its result. Saving with the secret field blank saves the other fields and leaves it Needs Secret. This changes today's Log Connection rule, which refuses a blank secret when no secret is stored. **Test** on a Needs Secret connection answers that the secret must be entered first, without trying to connect.
- A failing connection test stays separate: a connection whose test fails is still in scope.

### Docs

- `docs/usage.md`: a Setup File section covering export, import, the preview, blocked imports, Needs Secret, and that re-importing is safe.
- `docs/setup.md`: in Backup and restore, one paragraph on when a Setup File fits instead (seeding or sharing setup, no secrets, no Conversations) and that it is not a backup.

## Out of scope

A CLI command. Exporting settings, users, Conversations, Tickets or Filed Issues. Updating or removing existing records on import. Secrets in the file in any form. Choosing records at import time. An export button on a single Application. An audit log of exports and imports.

## Domain terms

Setup File, Needs Secret, Application, Repository, Tracked Branch, Database Connection, Log Connection, Attachment, Base Selector, Tag.

## Acceptance checks

- Exporting two of three Applications gives a file with exactly their attached resources, Attachments and Base Selectors, no secret or id, and says how many unattached resources were left out.
- Importing that file into an empty instance (separate `DATA_DIR` and `ENCRYPTION_KEY`) creates the Applications with all their Attachments. Repositories sync. Connections that had a secret show **Needs secret** in both lists, on their detail pages, on the Application's Attachment rows and in the nav counts.
- A Conversation on an imported Application cannot query a Needs Secret Database Connection or Log Connection. After the Admin enters the password, the connection is tested, the badge disappears and the agent can query it.
- Importing into an instance that already has one of the Repositories and an Application with the same name (different case) reuses both unchanged, adds only the missing Attachments, and lists them in the preview.
- A file naming a Repository the token cannot read, a missing Tracked Branch or an invalid Base Selector shows each problem in the preview, keeps Confirm disabled and writes nothing.
- Importing the same file twice creates nothing the second time.
- A wrong `format`, a newer `version` or malformed JSON is rejected with a clear message.
- Clients cannot call any export or import function.
- Server tests cover matching, blocking validation, the single transaction, re-import, scope exclusion and the Needs Secret save rules. Use the temporary-database and `fake-github.ts` patterns.
- Check both dialogs and the badges in light and dark themes, at desktop and phone widths, with keyboard only.
