import type { Repository } from "./repositories"

export type ApplicationInput = {
  name: string
  description: string
  notes: string
}
export type Application = ApplicationInput & { id: string }
export type ApplicationSummary = Application & { repositoryCount: number }

/** Extend this union with the connection kinds in steps 08 and 09. */
export type Attachment = { kind: "repository"; resource: Repository }
export type ApplicationScope = {
  application: Application
  /** Only explicit Attachments grant scope. Resource Tags are hints only. */
  attachments: Array<Attachment>
}
export type ApplicationsPage = {
  applications: Array<ApplicationSummary>
  total: number
  page: number
  pageSize: number
}
export type ApplicationField = keyof ApplicationInput
export type ApplicationProblem = {
  ok: false
  message: string
  field?: ApplicationField
}
export type ApplicationResult =
  { ok: true; application: Application } | ApplicationProblem
export type AttachmentResult = { ok: true } | ApplicationProblem
export const APPLICATIONS_PAGE_SIZE = 20
export const MAX_APPLICATION_NAME = 100
export const MAX_APPLICATION_DESCRIPTION = 1000
export const MAX_APPLICATION_NOTES = 10000
