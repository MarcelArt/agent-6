import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { TicketError, createTicketManagement } from "./ticket-management"
import type { TicketResult } from "@/lib/tickets"
import { ownTicketSearch, ticketEdits, ticketSearch } from "@/lib/tickets"

/*
 * Server functions behind the Ticket screens. Who may call them is checked
 * in `ticket-management.ts`.
 */

/** A refused action becomes an answer the form can show. */
function refused(error: unknown): TicketResult {
  if (!(error instanceof TicketError)) throw error
  return { ok: false, message: error.message, field: error.field }
}

/** A missing Ticket is a not-found page, not an error. */
async function orNotFound<T>(read: () => Promise<T>) {
  try {
    return await read()
  } catch (error) {
    if (error instanceof TicketError && error.status === 404) throw notFound()
    throw error
  }
}

const ticketId = z.object({ ticketId: z.string() })

export const listTickets = createServerFn({ method: "GET" })
  .validator(ticketSearch)
  .handler(({ data }) =>
    createTicketManagement().list(getRequestHeaders(), data)
  )

export const getTicket = createServerFn({ method: "GET" })
  .validator(ticketId)
  .handler(({ data }) =>
    orNotFound(() =>
      createTicketManagement().get(getRequestHeaders(), data.ticketId)
    )
  )

export const acceptTicket = createServerFn({ method: "POST" })
  .validator(ticketEdits.extend({ ticketId: z.string() }))
  .handler(async ({ data }): Promise<TicketResult> => {
    const { ticketId: id, ...edits } = data
    try {
      await createTicketManagement().accept(getRequestHeaders(), id, edits)
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })

export const declineTicket = createServerFn({ method: "POST" })
  .validator(z.object({ ticketId: z.string(), reason: z.string() }))
  .handler(async ({ data }): Promise<TicketResult> => {
    try {
      await createTicketManagement().decline(
        getRequestHeaders(),
        data.ticketId,
        data.reason
      )
      return { ok: true }
    } catch (error) {
      return refused(error)
    }
  })

export const listOwnTickets = createServerFn({ method: "GET" })
  .validator(ownTicketSearch)
  .handler(({ data }) =>
    createTicketManagement().listOwn(getRequestHeaders(), data)
  )

export const getOwnTicket = createServerFn({ method: "GET" })
  .validator(ticketId)
  .handler(({ data }) =>
    orNotFound(() =>
      createTicketManagement().getOwn(getRequestHeaders(), data.ticketId)
    )
  )
