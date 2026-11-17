# Decision AI advises the support agent

Decision AI recommends investigation resources, fix classifications and issue destinations; the regular support agent remains responsible for evidence and actions. Binding decisions could prevent the agent from discovering a fault outside the initially selected resources, so the agent may investigate other resources attached to the same Application and reconsider a recommendation when evidence conflicts.

Decision AI never expands access beyond Attachments or bypasses the existing read-only database, log scope, issue deduplication or issue filing rules. When Decision AI is disabled, unconfigured, unavailable, uncertain or returns invalid output, the regular agent flow continues. Each installation selects one provider through environment configuration; automatic failover between decision providers is excluded.
