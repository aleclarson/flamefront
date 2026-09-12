# Flamefront website

The website introduces Flamefront by letting developers use it. A short
explanation establishes what it is and why it exists; documentation, a forum,
persistent audio, and an editable playground provide the evidence.

This is the overall product and design plan. It establishes the experience,
technical boundaries, and initial scope without fixing individual element
positions. Features described here are planned, not a statement that the site
or its integrations already exist.

## Audience and purpose

The primary audience is TypeScript developers using or evaluating Octane who
need a framework for a complete web application. Developers familiar with
React Router are a secondary audience: routes, loaders, layouts, and forms
offer recognizable concepts as they explore Octane.

The site should help a visitor answer three questions:

1. What does Flamefront add to Octane?
2. Can it handle the different parts of the app I want to build?
3. How do I start, and where can I inspect a working example?

This audience is a positioning hypothesis based on the product. The initial
site should make evaluation easy without claiming broad adoption or maturity.
Flamefront's early-alpha status and prerequisites belong near getting started.

## Introduction and voice

Use a concise introduction instead of a traditional marketing hero. Working
copy:

> Flamefront is the app framework for Octane.
> Build static pages, server-rendered features, and browser apps together.
> Keep shared UI running as you move between them.

Follow that explanation with direct access to things visitors can use. The
home page should feel like the entrance to a small, useful application.
Avoid oversized slogans, repetitive feature sections, decorative metrics,
testimonials without evidence, and a long sales funnel.

Write plainly and specifically. Explain benefits through observable behavior:
music keeps playing when a route changes; an unchanged doc is reused in the
next build; submitting a forum reply saves it and updates the conversation.
Keep implementation explanations available through contextual links rather
than making them a required part of every interaction.

## One application, several rendering needs

The entire site uses Flamefront, Octane, and Panda CSS. A shared application
shell owns navigation, theme preference, and the ambient player. Routes own
their content and local interactions.

| Area           | Purpose                                                | Planned rendering                           | Evidence                                                                        |
| -------------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Home           | Explain what and why; provide an entry into the app    | Pre-rendered                                | A small introduction can share a shell with richer application features.        |
| Docs           | Help developers build and understand Flamefront apps   | Pre-rendered with incremental build caching | Unchanged content is reused across builds.                                      |
| Forum          | Support real questions and discussion                  | Server-rendered, with enhanced forms        | Live data and typed mutations work within the same app.                         |
| Playground     | Let visitors modify a small example and see the result | Client-rendered                             | Browser-heavy interactions can live alongside static and server-rendered pages. |
| Ambient player | Provide optional music throughout the visit            | Shared interactive shell                    | Playback and controls survive in-app navigation between rendering modes.        |

These are parts of one site with consistent navigation, URLs, theme, and
interaction conventions. Each address must also work when opened directly.

## Documentation

Use the existing documentation as the source of truth. Organize its published
experience around getting started, completing tasks, understanding concepts,
and looking up APIs. Avoid creating a second collection of guides solely for
the website.

Docs should prioritize readable prose, useful code examples, stable links,
heading navigation, and lightweight search. Generate the search index at
build time and load its browser interface when needed. Reading a page should
not depend on the editor, audio system, or search code being loaded.

Enable Flamefront's incremental prerendering and preserve its cache between
CI builds. Markdown pages have source-based content keys; MDX or component
pages need explicit keys to reuse their rendered content. Shared rendering
changes may invalidate multiple pages. This is build-time reuse: publishing
new content still requires a build and deployment.

Provide a small, optional build report that records the deployed revision and
actual counts of rendered and reused pages. It should explain the mechanism
without implying a cache hit occurred during the visitor's request. If
per-page results are exposed, derive them from the build rather than inventing
status labels. Keep build reporting outside the inputs that would needlessly
invalidate every documentation page.

See [incremental prerendering](../docs/incremental-prerendering.md) for the
existing cache contract, including CI restoration requirements.

## Forum

The forum should be useful enough to host actual Flamefront questions and
examples, while staying small. The first version supports browsing topics,
reading a thread, signing in, creating a topic, and replying. Reading is
public; posting requires an identity.

Use Turso for durable data and Cloudflare Workers for the server application.
The browser submits through the application; database credentials and write
authorization stay on the server. Flamefront loaders provide reads, and
server actions and forms provide mutations with pending, success, validation,
and failure states. Preserve an unfinished submission after a recoverable
failure. Prefer forms that retain their basic function without JavaScript.

The minimum data model is:

| Entity | Essential data and ownership                                                   |
| ------ | ------------------------------------------------------------------------------ |
| User   | Stable ID, authentication identity, display name, moderation role              |
| Topic  | ID, author ID, title, creation time, last activity time, open or locked status |
| Post   | ID, topic ID, author ID, body, creation and edit times, visibility status      |

A topic's first post contains its opening message; replies use the same post
model. Use stable IDs in URLs, paginate discussions, and order replies
consistently. Start with plain text or a restricted Markdown subset without
raw HTML. Include basic posting limits and moderator controls to hide posts
and lock topics before opening public writes.

Authentication provider and session integration remain decisions for the
implementation investigation. Notifications, reactions, direct messages,
attachments, and elaborate reputation features are outside the first version.

## Ambient player

Offer a small collection of ambient tracks with explicit permission for the
site's use. Playback starts only when the visitor chooses it. The first
version needs play/pause, track selection, volume, and clear loading or
unavailable states.

The shell owns one audio instance. Navigating among home, docs, forum, and
playground must not recreate it, restart its track, or lose its playback
position. Theme changes must also leave playback intact. Remember volume and
track preference where appropriate; a full reload need not resume playback
automatically.

Keep the controls quiet and reachable from every route. Use accessible names
and keyboard controls. Audio loading failures should leave the rest of the
site usable. Do not add a visualizer or animation merely to make the player
look active.

## Playground

The playground is the client-rendered toy. Begin with one small, playful
Octane example that responds immediately to edits, plus a few curated
variations if they improve learning. The default example must already run
when the visitor opens the page.

The essential loop is edit, compile, preview. Include reset, useful compiler
errors, and a way to return to a known working example. Keep the last good
preview visible when an edit fails, and clearly indicate that it is showing
the previous successful version. Load the editor and compiler on this route,
not throughout the site.

Investigate whether Octane has a suitable editor integration before choosing
a library. A worker should handle compilation where feasible; an isolated
preview frame should execute and render the result. The editor interface
itself remains in the page. Use revision IDs so an older compilation result
cannot replace a newer edit.

The intended integration is a small Flamefront application preview, including
client routing if supported by the browser toolchain. Browser execution of
Flamefront's build pipeline and Octane's compiler is unverified. A web worker
does not itself provide a server runtime: real server loaders, Turso access,
and prerender builds cannot be advertised as editable browser features
without a separate supported execution design.

Keep preview code isolated from the forum session and site storage. Restrict
initial imports to a known package set and provide a way to stop or reset a
broken preview. Arbitrary package installation, remote execution, saved public
projects, collaboration, and a full development environment are outside the
first version.

If full Flamefront compilation in the browser is impractical, bring that
finding back before reducing the promise to an Octane component preview.

## Visual design and interaction

The site is ultra minimal. The light theme uses a white background; the dark
theme uses a near-black background. Both use restrained neutral surfaces,
clear text contrast, subtle borders, and very little decoration. Typography,
spacing, and content hierarchy do most of the work.

Use Panda CSS for shared semantic tokens and a small set of reusable recipes.
Tokens should cover background, surface, text, muted text, border, focus,
selection, and semantic feedback colors in both themes. Avoid route-specific
styling systems. Code highlighting should fit the same restrained palette
while remaining readable.

Follow system theme initially and allow an explicit light or dark preference
that persists across navigation and later visits. Apply that preference early
enough to avoid an obvious theme flash.

Use compact, legible type, comfortable prose line lengths, and consistent
spacing. Distinguish links and controls clearly. Reserve stronger color for
focus, selection, and feedback; do not depend on color alone to communicate
state. Avoid gradients, large promotional illustrations, ornamental cards,
and unnecessary motion.

Support keyboard navigation, visible focus, reduced motion, and sensible focus
placement and page titles after navigation. On small screens, docs and forum
remain straightforward to read; the playground may switch between editing
and preview instead of requiring both side by side. Exact arrangement is a
later design decision.

## Deployment and ownership

The deployment goal is Cloudflare Workers serving the dynamic application
alongside the site's built static assets, with Turso providing forum storage.
CI builds the site, restores and saves prerender caches, and publishes a
complete deployment. Build caches are separate from deployed assets and
runtime data.

The current [deployment guide](../docs/deployment.md) documents a Web Fetch
entry for custom hosts; it does not establish a verified Workers deployment.
Verify the server bundle, asset bindings, route-data and fragment requests,
actions, cookies, and database integration on Workers before treating this
architecture as ready to ship. Panda CSS extraction from the chosen Octane
source format also needs an early build check.

Keep the site as a dedicated app in this repository, separate from the
existing framework test playground. Framework code owns general rendering
behavior; the site owns authentication, forum policies, database access,
content, audio assets, and playground isolation. Any framework gaps discovered
while building the site should be addressed explicitly within their own scope.

## Delivery plan

1. **Verify the uncertain integrations.** Prove one Workers route can read and
   write Turso, static navigation works on that host, Panda CSS extracts the
   app's styles, and the proposed browser compiler can produce a preview.
   Record limitations before expanding those features.
2. **Build the shell and documentation.** Establish themes, navigation, the
   concise introduction, existing docs, incremental caching, and a working
   deployment. Add the player early to test shell persistence as routes grow.
3. **Open the forum.** Deliver public reading and authenticated topic/reply
   submission, with validation, pagination, and basic moderation.
4. **Complete the playground and evidence.** Deliver the editable toy,
   compilation feedback, isolated preview, build report, and contextual links
   to the site's implementation.

## Acceptance criteria

- A visitor can understand what Flamefront adds from a few sentences and
  immediately reach a working feature or getting-started guide.
- Every part of the site runs through the Flamefront application and uses the
  shared Panda CSS design system in light and dark themes.
- A second unchanged docs build demonstrates cache reuse; changing a page
  updates its deployed content, and each build produces complete output.
- Forum topics and replies persist in Turso through the Workers application;
  failed or unauthorized submissions have clear, correct outcomes.
- Music continues at its current position while navigating across static,
  server-rendered, and client-rendered routes.
- The playground updates from valid edits, explains invalid edits, and can
  recover from a broken example without exposing the site's session.
- Direct URLs, refresh, browser back/forward, keyboard navigation, and narrow
  screens work across all sections.
- Public claims and implementation links describe the deployed behavior.

## Decisions still open

The overall direction is set: a minimal working app, pre-rendered docs, a
Turso-backed forum on Workers, persistent ambient audio, and a client-rendered
playground. Implementation investigation should settle the editor integration,
browser compilation boundary, authentication provider, and licensed music
source. Detailed layout and the exact playful example follow those decisions.
