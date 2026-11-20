import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import { getDb } from "./db"
import { apiKey, auditEvent } from "./schema"
import type { Db } from "./db"
import type { AuditEntry } from "@/lib/service-accounts"

/** Who made a protected change: an Admin in the browser or a Service Account's API Key. */
export type Actor =
  | { type: "admin"; userId: string }
  | { type: "service-account"; serviceAccountId: string; apiKeyId: string }

export type AuditRecord = {
  operation: string
  targetType: string
  targetId: string | null
}

/** The audit trail. It stores ids only, never key material or request bodies. */
export function createAuditRepository(db: Db = getDb()) {
  return {
    record(actor: Actor, item: AuditRecord, now = new Date()) {
      db.insert(auditEvent)
        .values({
          id: randomUUID(),
          actorType: actor.type,
          userId: actor.type === "admin" ? actor.userId : null,
          serviceAccountId:
            actor.type === "service-account" ? actor.serviceAccountId : null,
          apiKeyId: actor.type === "service-account" ? actor.apiKeyId : null,
          ...item,
          createdAt: now,
        })
        .run()
    },

    /** The latest changes a Service Account made, newest first. */
    forServiceAccount(serviceAccountId: string, limit = 20): Array<AuditEntry> {
      return db
        .select({
          id: auditEvent.id,
          operation: auditEvent.operation,
          targetType: auditEvent.targetType,
          targetId: auditEvent.targetId,
          keyId: auditEvent.apiKeyId,
          keyName: apiKey.name,
          createdAt: auditEvent.createdAt,
        })
        .from(auditEvent)
        .leftJoin(apiKey, eq(apiKey.id, auditEvent.apiKeyId))
        .where(eq(auditEvent.serviceAccountId, serviceAccountId))
        .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          operation: row.operation,
          targetType: row.targetType,
          targetId: row.targetId,
          apiKey:
            row.keyId && row.keyName
              ? { id: row.keyId, name: row.keyName }
              : null,
          createdAt: row.createdAt.getTime(),
        }))
    },
  }
}
export type AuditRepository = ReturnType<typeof createAuditRepository>
