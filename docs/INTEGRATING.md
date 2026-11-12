# Integrating Mariam

An intranet, a portal or a bot reads a site's menus with no account, at
`https://<organization host>/v1/orgs/{org}/sites/{site}` (`S` below).

| Need | Read |
|------|------|
| Practical information: hours, payment methods, step-free access, address, contact | `GET S` |
| Today's and tomorrow's menus, by category, the main dish in a highlighted category | `GET S/menus?from=<today>&to=<tomorrow>` |
| Dietary tags and labels of each dish, out-of-stock dishes and their substitutes | in each menu: `dish.tags`, `dish.certifications`, `is_out_of_stock`, `substitutions` |
| Every tag and label, with its name and logo | `GET /v1/taxonomy` |
| Closures under way and to come | `GET S/closures` |

- **Read from your server, not from each visitor's browser**, and keep the answer for five
  minutes. Every public read carries an `ETag`: ask again with `If-None-Match` and an unchanged
  answer is a `304` with no body. A campus reaches the API through one address, and the limit
  counts per address.
- **Limits.** 600 requests per minute per address by default; over it, `429` with
  `Retry-After`.
- **What the answers guarantee.** Only published menus, within the site's window. Days are Paris
  dates (`YYYY-MM-DD`), instants RFC 3339. A field without a value is present as `null`. An
  error is an RFC 9457 problem whose `code` stays stable.
- **Identifying yourself.** Recommended, never required: an anonymous request gets the same
  answer. Name your application, its version and a contact in `User-Agent`, such as
  `CampusPortal/2.3 (+https://portal.example.edu; it@example.edu)`. To become a known
  integrator, and hear of changes as the next point says, write to contact@mariam.app with the
  application, the routes it reads and a contact address.
- **Changes.** `/v1` follows the versioning rules of [API.md](API.md#conventions). Until 1.0.0, a known integrator hears of any change to the
  routes it reads before the release that makes it.

Every route, field and code: [API.md](API.md), or the OpenAPI specification at `/v1/openapi.json`
(browsable at `/v1/docs`).

## Terms of use

- **The code** is under [LICENSE.md](../LICENSE.md), which governs what you do with the code
  itself. Reading the API of an instance, the hosted service included, needs no license to the
  software.
- **The data.** Menus belong to the organization that publishes them, such as the operator of a
  restaurant, which sets their terms of reuse; these are yet to be stated. Until then, credit the
  source wherever you show them, as in "Data: <organization>, via Mariam". The label logos of
  `/v1/taxonomy` are official marks, and their owners' rules of use apply wherever you show them.
- **The hosted service** (`*.mariam.app`) comes as is, with no guarantee of availability. Its
  state and history are at <https://status.mariam.app>. A client that ignores the limits or the
  caching above can be blocked.
- **Institutions** that need commitments, such as a named contact, notice before a change or word
  of an incident, or help with an integration, write to contact@mariam.app.

These terms live in this repository: each change is dated and public, in its history and in
[CHANGELOG.md](../CHANGELOG.md), and a known integrator hears of it before it applies.
