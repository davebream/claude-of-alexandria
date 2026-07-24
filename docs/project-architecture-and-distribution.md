# Project Architecture and Distribution Proposal

Status: proposal
Audience: contributors, users, and downstream operators

## Summary

Claude of Alexandria currently ships two closely connected parts:

1. research skills and agents designed for Claude;
2. a remote MCP server that provides structured biblical research data.

The MCP server is not technically limited to Claude. It can be used by any
compatible MCP client. This document proposes making that separation explicit:

```text
Claude of Alexandria
└── Claude-specific skills and research workflows

Independent research service (name to be selected)
├── Research Core — model-neutral queries, schemas, and data access
├── MCP           — model-neutral AI-client interface
├── API           — optional future application interface
└── Local         — self-hosted distribution
```

**Claude of Alexandria** should remain the name of the Claude-specific research
experience. It is intentional wordplay on the "[scholar's name] of Alexandria"
pattern, not a generic name for every component in the repository. Renaming it
around a corpus would lose that identity.

The model-neutral research service should have an independent product identity.
Hiding Claude behind the `CoA` abbreviation would not remove the association,
and it would make new users decode an acronym before understanding the service.
The independent name should work for MCP, a possible API, and local
distribution rather than naming one protocol or AI vendor.

The proposed change keeps the project open source and self-hostable. It creates
clearer boundaries between the data and research logic, protocol adapters,
client-specific skills, and hosted deployments.

## Goals

- Keep the software open source and self-hostable.
- Make the research-data service usable from multiple MCP clients.
- Give the model-neutral service an independent product and package identity.
- Keep client-specific skills separate from the model-neutral data service.
- Deliver dataset attribution and provenance with every result.
- Provide a documented path for building or obtaining a compatible local corpus.
- Allow the hosted deployment to use authentication and operational limits
  independently of local deployments.
- Prepare the research core for other interfaces without duplicating research
  logic.

## Non-goals

- Replacing MCP with a proprietary protocol.
- Renaming Claude of Alexandria or discarding its scholar-name wordplay.
- Selecting the independent service's final public name in this proposal.
- Making the hosted endpoint the only practical way to use the project.
- Publishing a REST API before there is a concrete integration need.
- Splitting the project into multiple repositories immediately.

## Product and package boundaries

### Research Core

The Research Core should contain protocol-neutral operations:

```text
input validation
→ biblical reference normalization
→ database query
→ result shaping
→ provenance resolution
```

It should return typed research results rather than MCP-specific responses.

The current implementation combines these concerns. For example, tool functions
such as `queryMorphology()` both query data and build an MCP `CallToolResult`.
This is practical for the current server, but it makes reuse by another
interface harder.

The intended boundary is:

```ts
const result = await research.queryMorphology(input, context);
```

Protocol adapters can then format the same result for their own clients.

### Model-neutral MCP

MCP should be the primary model-neutral interface for AI clients. It should:

- use Streamable HTTP for the hosted server;
- retain the existing tool contracts and cursor pagination;
- expose provenance in every successful result;
- support standards-based authorization when authentication is enabled;
- remain usable without the Claude of Alexandria Skills package;
- have its own server identity and version.

The two products should have distinct identities:

| Surface                       | Direction                                      |
| ----------------------------- | ---------------------------------------------- |
| Claude-specific experience    | Claude of Alexandria                           |
| Model-neutral service         | Independent name to be selected                |
| MCP display title and package | Derived from the independent service brand     |
| Compatibility line            | Works with Claude and other compatible clients |

Package and registry identifiers should be derived from the independent
service brand. Existing endpoint and configuration names should remain
available if extraction requires a documented migration period.

### Claude of Alexandria Skills

The skills package should contain the research workflows that teach an AI client
how to use the data responsibly. It may remain client-specific where packaging
formats require that.

Skills may depend on a minimum MCP contract version, but the skill version and
server version should not need to remain identical forever.

## Repository decision

The project should remain a monorepo for now.

The skills, MCP tool names, schemas, provenance contract, and end-to-end tests
change together. Splitting repositories now would add release coordination
without improving the user experience.

A future structure could be:

```text
packages/
└── research-core/

apps/
├── hosted-mcp/
└── rest-api/          # optional, if later required

distributions/
└── claude-skills/
```

The directory names are illustrative. The important boundary is:

```text
research logic → protocol adapter → hosting environment
```

A repository split should be reconsidered only when the MCP server has a
meaningfully different maintainer group, release schedule, or independent
contributor community.

## MCP and a possible REST API

MCP is an API, but it is designed for AI hosts rather than general application
development. A conventional REST API may later be useful for scripts, websites,
and data integrations.

If both interfaces exist, neither should call the other over public HTTP:

```text
MCP adapter  ─┐
              ├→ Research Core → database
REST adapter ─┘
```

This avoids extra latency, duplicate authentication, double metering, and
token-forwarding problems.

The two interfaces should share:

- input and output schemas where appropriate;
- biblical reference normalization;
- pagination rules;
- provenance;
- access policy;
- usage accounting;
- dataset availability rules.

The MCP SDK should remain confined to the MCP adapter. A future REST client SDK
should be generated from an OpenAPI contract rather than built on the MCP SDK.

## Authentication

Authentication is a property of the official hosted service, not a restriction
on the open-source software.

### Hosted MCP

Interactive remote MCP clients should use OAuth. The flow is:

```text
client connects
→ server returns an OAuth challenge
→ user signs in and grants access
→ client receives a short-lived access token
→ server identifies the account and applies its access policy
```

The implementation should follow the current MCP authorization specification:

- OAuth Protected Resource Metadata;
- authorization-server discovery;
- Authorization Code flow with PKCE;
- short-lived access tokens and refresh-token rotation;
- resource and audience validation;
- `401`, `403`, and `429` responses with useful metadata.

OAuth access tokens must be issued for the MCP server and must not be forwarded
unchanged to another API.

### API tokens

If a conventional API is added, personal API tokens are appropriate for scripts
and automated integrations. They should be:

- associated with an account;
- individually named, scoped, expirable, and revocable;
- shown only once;
- stored only as secure verifiers, not plaintext;
- sent in the `Authorization` header, never in a URL.

OAuth tokens and API tokens may resolve to the same internal account and access
policy, but they should normally remain different credentials.

Some hosted MCP clients support organization-wide static headers, but per-user
OAuth is the interoperable default for cloud-synced connectors. A static shared
token is suitable only for an explicitly shared institutional connection.

### Self-hosting

A local operator should not be required to use the official OAuth service. Local
or independently hosted deployments may choose no authentication, local
credentials, or their own identity provider.

## Operational limits

Hosted deployments may apply rate limits, concurrency limits, and usage quotas
to protect reliability and prevent abuse. Local operators remain free to choose
limits appropriate for their own deployments.

Limits should use stable account or application identifiers where available. IP
limits are useful as coarse abuse protection, but an IP address is not a
reliable user identity.

Short burst control and longer accounting serve different purposes:

| Control                 | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| Edge/IP protection      | Reduce floods and unauthenticated abuse            |
| Per-account burst limit | Prevent accidental loops and noisy clients         |
| Longer usage accounting | Apply the hosted service's published access policy |

If MCP and REST interfaces coexist, accounting should occur at the shared
research-operation layer so switching interfaces does not duplicate an
allowance.

## Open-source and data boundaries

The repository's existing open-source licence remains unchanged by this
proposal. Hosted authentication and operational controls are deployment
features, not changes to the source distribution.

Dataset provenance and attribution remain separate from the software licence.
The dataset registry records the source, version, attribution, modification
notes, and applicable terms for data returned by the service.

## Provenance contract

Every successful MCP result should identify the datasets used for that page. The
current contract implements this through a `provenance` object and a canonical
dataset-attribution page.

The canonical dataset registry should remain the source for:

- MCP result provenance;
- the hosted dataset-attribution page;
- repository notices;
- dataset-to-tool mappings;
- source versions and hashes;
- modification statements;
- special conditions.

This generated approach is preferable to maintaining independent notices that
can drift.

## Local distribution and self-hosting

A documented local distribution should follow this shape:

```text
pinned source manifest
→ reproducible extraction and normalization
→ compatible database snapshot or deterministic build
→ local MCP or independently hosted MCP
```

The source manifest, corpus version, and build instructions should make local
deployments easy to verify and update.

## Versioning

Four versions should be distinguishable:

| Version      | Meaning                                    |
| ------------ | ------------------------------------------ |
| MCP contract | Tool names, inputs, outputs, and behavior  |
| Server       | Hosted/local implementation release        |
| Corpus       | Exact dataset snapshot and source manifest |
| Skills       | Research workflows and client packaging    |

A Skills release should declare the MCP contract range it supports. A Corpus
release should identify its full source and provenance manifest.

## Migration sequence

1. Document the intentional Claude of Alexandria identity and the need for a
   separate model-neutral service identity.
2. Select the independent service name and derive its package and server
   identities from it.
3. Preserve endpoint and configuration aliases where extraction requires
   them.
4. Extract protocol-neutral research operations.
5. Add standards-compliant OAuth to the hosted MCP.
6. Publish the remote server in the official MCP Registry.
7. Publish a documented local corpus distribution.
8. Add a conventional API only when a concrete integration requires it.
9. Publish a local package that can obtain a compatible database.
10. Reconsider a repository split only after independent maintenance or adoption
    justifies it.

## Open decisions

- The independent service's final name, package, and registry identities.
- Whether a REST API has enough concrete demand to publish.
- How long existing package identifiers and endpoints should remain supported.
- Which identity provider should operate the hosted OAuth flow.
- Which local corpus distribution format should be supported first.

## References

- [Model Context Protocol authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Publishing remote servers in the MCP Registry](https://modelcontextprotocol.io/registry/remote-servers)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
- [Cloudflare Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Dataset attribution page](https://coa.davebream.com/legal/datasets)
