/** Counts shown on Admin nav items. */
export type NavCounts = {
  /** Tickets waiting for an Admin's review. */
  pendingTickets: number
  databaseConnectionsNeedingSecret: number
  logConnectionsNeedingSecret: number
}
