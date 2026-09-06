# Contributing

Thanks for taking the time to contribute to DiceBear Studio, the DiceBear plugin for Figma.

## Before you start

- Bugs and small fixes: open a pull request directly.
- Larger changes (new settings, changes to the export format, UI rewrites): please open an issue first so we can agree
  on the approach before you spend time on it.
- Security issues: do **not** open a public issue. Email <contact@dicebear.com> instead; see the
  [DiceBear security policy](https://github.com/dicebear/.github/blob/main/SECURITY.md).
- All contributors are expected to follow the
  [DiceBear Code of Conduct](https://github.com/dicebear/.github/blob/main/CODE_OF_CONDUCT.md).

## Requirements

- [Node.js](https://nodejs.org/) 20.19 or newer
- The [Figma desktop app](https://www.figma.com/downloads/) (required to load local plugins)

## Local setup

```sh
git clone https://github.com/dicebear/studio.git
cd studio
npm install
```

## Load the plugin in Figma

1. Run `npm run build` once so that `dist/` exists.
2. In the Figma desktop app, open **Menu → Plugins → Development → Import plugin from manifest…**.
3. Select `public/manifest.json` from this repository.

The plugin then shows up under **Plugins → Development → DiceBear Studio**.

## Scripts

| Script               | What it does                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| `npm run dev`        | Rebuilds the UI (`dist/index.html`) and sandbox (`dist/code.js`) on change |
| `npm run build`      | Type-checks, then builds UI and sandbox for production                     |
| `npm run type-check` | Runs `tsc -b` over the UI, sandbox and config projects                     |
| `npm test`           | Runs the unit tests with Vitest                                            |
| `npm run analyze`    | Builds the UI with a bundle report in `dist/stats.html`                    |
| `npm run notices`    | Collects the license notices of the shipped packages for the About dialog  |

While `npm run dev` is running, re-run the plugin in Figma after each change (right-click the plugin → **Run**) to pick
up the latest build.

## How the plugin is structured

```
src/
├── shared/      # Types and pure logic both sides import, no DOM and no `figma` global
│   ├── messages.ts   # The request/event contract between window and sandbox
│   └── storage/      # Definition cache and library over a key-value store
├── code/        # Figma sandbox script (has access to the Figma API)
│   ├── bridge.ts     # Routes the window's requests and events to handlers
│   ├── export/       # Builds the exported definition
│   ├── generate/     # Fills layers and inserts avatars
│   ├── import/       # Rebuilds a definition file as Figma pages
│   ├── selection/    # Describes the selection for the window: fill targets, avatar records
│   ├── settings/     # Reads/writes plugin data on the frame
│   └── utils/
└── ui/          # React app shown in the plugin window
    ├── components/   # Shared components, `ui/` holds the shadcn/ui sources
    ├── features/     # One folder per tab: generate, inspect, style
    ├── generated/    # Third-party license notices, written by `npm run notices`
    ├── lib/          # Bridge, API client, catalog cache, rendering
    └── store/        # zustand stores
public/manifest.json  # plugin manifest
```

The plugin has two entry points, each built by Vite into `dist/`:

- **UI** (`src/ui/`): a React app (`index.html` → `dist/index.html`) that runs in the plugin's iframe. Controls are
  [shadcn/ui](https://ui.shadcn.com) components on Radix primitives, styled with Tailwind CSS and mapped onto Figma's
  theme variables so the window follows the light and dark theme. State lives in zustand stores. Avatars are rendered
  here with `@dicebear/core`, as SVG for previews and inserts, rasterised to PNG for image fills.
- **Sandbox** (`src/code/`): the plugin script (`src/code/index.ts` → `dist/code.js`) with access to the Figma API. It
  never parses a definition, it applies what the window sends.

The two sides exchange the messages declared in `src/shared/messages.ts`. A request carries a `requestId` and gets one
reply, an event is fire and forget. Both bundles compile against that file, so a message can only be sent in the shape
the other side reads. The window uses `request()` and `postEvent()` from `src/ui/lib/bridge.ts`, the sandbox registers
handlers with `onRequest()` and `onEvent()` from `src/code/bridge.ts`.

Settings that belong to a frame (title, license, per-component probability, per-color-group constraints, etc.) are
persisted with `node.setPluginData` / `node.getPluginData` in `src/code/settings/`. Preferences (window size, last tab
and style), the definition cache and the library live in `figma.clientStorage`, which the window reaches through the
`storage:*` requests.

## Before you open a pull request

Run:

```sh
npm run type-check
npm test
npm run build
```

Then smoke-test the change in the Figma desktop app. The basics to check:

- Generate: fill a rectangle, an ellipse with a corner radius and a frame; the shapes keep their form and get an image
  fill. A locked layer is skipped and named. Insert a dozen avatars with and without a selection. One Cmd+Z reverts the
  whole batch. The relaunch buttons on a generated layer draw new seeds or open the picker.
- Style: selecting a frame renders the settings without errors. A setting you changed survives closing and reopening the
  plugin. If your change touches export code, export a definition and diff it against one from the previous build.
  Import a definition into an empty file and check the thumbnail page. Upload the exported definition to the library in
  the Generate tab and render with it.
- Inspect: select a filled layer, an inserted avatar and a group holding both. Every avatar is listed, the API URL opens
  the same avatar in the browser, and the copy buttons work in the plugin window.
- Offline: an uncached style shows an error with a retry, a cached one still renders.

## Code style

- Prettier handles formatting (see `.prettierrc`): 120 columns, single quotes, prose wrap.
- Indentation is two spaces (see `.editorconfig`).
- TypeScript everywhere.
- Do not import from the DOM or from React inside `src/code/` or `src/shared/`. The sandbox runs in Figma's QuickJS
  sandbox, not a browser, and the shared code compiles under both projects.

## Licensing

By submitting a pull request, you agree that your contribution will be released under the [MIT License](./LICENSE).
