import "@tanstack/react-start/server-only"

import { and, eq, isNull, lt } from "drizzle-orm"
import { getDb } from "./db"
import { message, upload } from "./schema"
import type { Db } from "./db"

export type UploadRecord = typeof upload.$inferSelect

export function createUploadsRepository(db: Db = getDb()) {
  return {
    create(record: Omit<UploadRecord, "messageId" | "position">) {
      db.insert(upload).values(record).run()
    },
    /** The upload and, once its message is sent, the Conversation it belongs to. */
    find(id: string) {
      return db
        .select({ upload, conversationId: message.conversationId })
        .from(upload)
        .leftJoin(message, eq(message.id, upload.messageId))
        .where(eq(upload.id, id))
        .get()
    },
    /** Removes an upload that was never sent with a message. */
    removeUnsent(id: string) {
      return db
        .delete(upload)
        .where(and(eq(upload.id, id), isNull(upload.messageId)))
        .returning({ id: upload.id })
        .all().length
    },
    /** Uploads picked before `before` and never sent. */
    unsentBefore(before: Date) {
      return db
        .select({ id: upload.id })
        .from(upload)
        .where(and(isNull(upload.messageId), lt(upload.createdAt, before)))
        .all()
    },
    ids() {
      return db.select({ id: upload.id }).from(upload).all()
    },
  }
}
export type UploadsRepository = ReturnType<typeof createUploadsRepository>
