# Build and inspect the included app

> Build one static page, inspect its saved data, and serve the result locally
> before deciding whether to use Flamefront in your own application.

This guide assumes basic terminal use. You do not need an existing Octane
project. If you have not yet decided whether the problem applies to you, read
[the introduction](index.md) first.

## 1. Get the example

You need Git, Node.js 26 or newer, and pnpm 11. The commands below use a POSIX
shell, such as macOS Terminal or a Linux terminal. Confirm your tools:

```sh
git --version
node --version
pnpm --version
```

Clone into a new directory and install the repository's locked dependencies:

```sh
git clone https://github.com/aleclarson/flamefront.git
cd flamefront
pnpm install --frozen-lockfile
```

If you already have this checkout, start in its root and run only the install
command. Keep the terminal at the repository root for the rest of this guide.
The root scripts run the included app in `playground/`.

## 2. Build the About page

Open `playground/src/app.ts` in your editor. Find this existing entry; you do
not need to edit it:

```ts
route("/about", "/src/AboutPage.tsrx", {
  render: "static",
  hydration: "none",
})
```

`static` means the build generates the page's HTML. `hydration: "none"` means
the browser leaves this page's HTML non-interactive; the shared shell has its
own setting. The component file also exports a **loader**, a function that
reads the data needed by the page. For this static route, the build runs it.

Run:

```sh
pnpm build
```

This builds the entire included app, including `/about`. It replaces
`playground/dist/`, so keep authored files outside that directory. The end of
the build includes these lines:

```text
Generated dist/client/static-interactive/index.html.
Generated dist/client/about/index.html.
```

## 3. Inspect the output

Open `playground/dist/client/about/index.html` in your editor. Find the text
`Built once, served as a document`. It is already in the generated HTML.

Then print the saved loader data:

```sh
cat playground/dist/client/about/index.data.json
```

Expected content:

```json
{ "message": "Generated /about during ff build." }
```

These two files show that the build generated both the page and its data.
The message is example data returned by the loader.

## 4. Serve the build

```sh
pnpm preview
```

Leave that terminal running and open <http://localhost:4173/about>. You should
see `Built once, served as a document` and the saved loader message. Reload
the URL directly to check that it works without navigating from the home page.
Stop the process with Ctrl+C when finished.

You have completed the trial when the build produces both files and the
preview serves `/about` with that content. You have seen what the manifest's
static choice produces; you do not need to explore the other demo routes yet.

If you want to apply this to your own project, continue with
[Create a one-page app](create-app.md). If your current tools already produce
what you need, this is a reasonable place to stop.

## If the trial fails

| Symptom                                              | Check or next action                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A tool command is missing, or Node is older than 26. | Install the required tool/version before continuing.                                                    |
| Installation fails.                                  | Check the first package-manager error, registry access, and the tool versions above. Keep the lockfile. |
| Preview says `Run ff build first`.                   | Run `pnpm build` from the repository root and address any build error before previewing.                |
| Port 4173 is in use.                                 | Run `PORT=4174 pnpm preview` and open `http://localhost:4174/about`.                                    |

The current CLI can print Node deprecation and experimental warnings. A
warning alone is not a failed build; check the exit status and output files.
