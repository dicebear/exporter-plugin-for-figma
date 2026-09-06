# Changelog

All notable changes to DiceBear Studio for Figma will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Generate avatars. The new Generate tab fills the selected layers with avatars as image fills, which keeps their shape,
  corners and masks, or inserts a batch of new avatars as vector frames. The tab opens on a gallery of the DiceBear
  collection, loaded from `api.dicebear.com` and cached in the plugin storage, next to the style built in the current
  file and a personal library of uploaded definition files that survives across files. Seeds come from a random draw,
  the layer names, a list or a numbered prefix. Every option the style offers is a control, variants show as thumbnails
  on the current avatar, colors as the palette's swatches. A preview grid shows the avatars before they land. Each
  generated layer remembers its style, seed and options, and two relaunch buttons draw new seeds or open the picker for
  another style.
- Inspect avatars. The new Inspect tab shows what a generated layer carries: the style and its version, the seed, the
  options that differ from the style's defaults, the `api.dicebear.com` URL as SVG, PNG, JPG or WebP, and the JavaScript
  that renders the same avatar with `@dicebear/core`. Each of them has a copy button. Selecting a frame or group lists
  every avatar inside it.
- An About dialog behind the info icon in the rail, with the plugin's version and license, the license notices of every
  package it ships, and links to the documentation, the privacy policy and the legal notice.
- The plugin window follows Figma's light and dark theme and can be resized from the corner. Its size and the last tab
  are remembered.
- Export for DiceBear 11.x, the line that plays animations.
- Round-trip animations with Figma Motion. The export turns a layer's keyframe tracks (translation, rotation, scale,
  opacity) into the `animations` blocks of `@dicebear/schema` 2.0, the import writes them back onto the layers. The
  animation name is the layer name. The layer opacity is the resting state of the still avatar, the keyframes only say
  how it moves, so a part that shows only while the animation plays sits at zero opacity. Whatever one side cannot
  represent, springs or negative delays for example, is approximated or skipped with a warning. Both directions need
  Figma's motion API.
- Round-trip `currentColor`, reference colors, and opacity of component references.
- A License page on import. It holds one card with the license line of the definition and the source, designer and
  license rows, linked where the definition names a URL. Definitions without a license get a warning instead.

- Show the export progress. The loading screen names the component that is being exported and counts the steps on a
  progress bar, and the export gives the window a turn between components so it stays responsive.

### Removed

- The export for DiceBear 10.x and older. The plugin writes 11.x definitions only, so the version setting, the 9.x npm
  package export with its templates, and the package and hook forms are gone. The 10.x cores render 11.x definitions the
  same, without the animations.

### Changed

- The window is a React app on shadcn/ui and Tailwind CSS instead of Vue and PrimeVue. PrimeVue 5 requires a license
  key, which a plugin that is handed to everyone cannot carry.
- The sandbox no longer bundles `@dicebear/core`. The window computes what the renderer picks for the thumbnail seeds
  and sends it along with an import.
- The window and the sandbox exchange typed requests and events declared in one shared file instead of strings split on
  colons.
- Build the thumbnail tiles from the avatar frame instead of importing rendered SVGs. Each tile is a clone of the frame
  with the variants, transforms and colors the DiceBear resolver picked for its seed, so the tiles stay editable:
  variants swap through the instance dropdown, colors rebind to the palette styles. An instance whose nested parts carry
  a transform of their own is detached in the tile, Figma allows no position override inside an instance. Layers on
  `currentColor` keep the color the import chose for the frame.
- Write the SVG from the layer data instead of running Figma's SVG export on a copy of the frame. Geometry comes from
  `fillGeometry` and `strokeGeometry`, paints, effects, masks, blend modes and keyframe tracks are read from the layers.
  The export no longer clones the frame, swaps instances or flattens boolean layers, and nothing that Figma's export
  baked in (mask bounds, style opacities, filter ids) has to be undone. Two things read differently: the children of a
  frame with a palette fill keep their own colors instead of inheriting the palette, and nested groups keep their
  structure with transforms that svgo folds into the paths. Frames still do not clip, the avatar clips at the canvas.
  Angular and diamond gradients, background blur and image fills have no SVG counterpart and are reported as warnings.
  An inside or outside stroke runs along a primitive moved by half its weight, the way Figma's export wrote it, or is
  cut to the side of the fill it belongs on, since Figma outlines such a stroke with twice its weight. An instance that
  masks its siblings keeps its component reference inside the `<mask>`, so the masked layers no longer drop out of the
  export. A mask keeps its opacity and effects, a mask at zero opacity hides its layers and is reported, like an empty
  one.
- A line layer draws its stroke above its y position and keeps round and square caps inside its width, as Figma does,
  instead of half a stroke lower and a cap longer.
- A fill or stroke with a blend mode of its own keeps it as `mix-blend-mode` on its element. The export dropped it and
  only carried the layer's blend mode.
- The `$comment` of an exported definition says exported instead of generated, the file may be edited by hand.
- Reference `@dicebear/schema@2.0.1` in definition files.
- Keep definitions stable across an import and the following export: circles that Figma turned into paths are rebuilt,
  the precision comes from the imported file, and the export ends with a newline.
- Export layers bound to the background palette like any other layer. Version 39 dropped them from the definition, which
  also removed layers that use the background color on purpose. The import now binds the background palette to the fill
  of the avatar frame instead of adding a background rectangle. The export renders the frame contents only, so that fill
  stays out of the definition. A file imported with version 39 still holds the rectangle, delete it before the next
  export.
- Turn rectangles into paths before merging, so neighbouring shapes with the same fill become one element. Pixel styles
  come out about a quarter smaller, and an export now passes the check of `dicebear optimize`, which has run this step
  all along.

## [39] - 2026-08-27

### Changed

- Rename the plugin from DiceBear Exporter to DiceBear Studio. It now works in both directions between Figma and
  definition files, so the old name no longer describes what it does.
- Show a welcome screen while nothing is selected, instead of a red error box.
- Reference `@dicebear/schema@1.5.1` in exported definition files (was `1.3.0`).

### Added

- Import definition files. The Import button reads a 10.x definition JSON and rebuilds it in an empty Figma file: one
  component per variant, the palettes as color styles linked to the matching layers, the avatar frame, the group
  settings, and the license and creator metadata. Exporting the result reproduces the definition. The plugin skips or
  approximates what Figma cannot represent, CSS animations in `<style>` elements for example, and lists it as warnings.
- Validate definition files before the import starts, so the plugin rejects an invalid file with a list of the
  violations instead of failing halfway through. The check runs through `@dicebear/core`, which also catches broken
  component aliases that the schema alone does not cover.
- Keep the alpha of imported layers whose palette color carries its own `fill-opacity` or `stroke-opacity`. It becomes
  the layer opacity and comes back out of the next export. Where the layer draws more than that one color, the plugin
  drops it with a warning.
- Ignore background layers on export. Layers bound to the color group named by the background option stay out of the
  definition, DiceBear paints that background at render time. The import adds such a layer for styles with a
  `background` palette.
- Add a "Start here" guide next to the imported avatar frame, one card for building an avatar and one for editing the
  style.
- Generate a file cover during the import. A Thumbnail page holds a 1600x960 cover with the style name, the DiceBear
  badge, and a staircase of sample avatars rendered with `@dicebear/core`. The cover becomes the file thumbnail.

### Fixed

- Keep the opacity of layers below a palette-bound layer in the export. Figma bakes the bound style's alpha into
  `fill-opacity` and `stroke-opacity`, which the palette value already carries, so the export drops the attribute there.
  The layers below it keep their own opacity, written relative to the palette alpha.

## [38] - 2026-06-03

### Changed

- Reference `@dicebear/schema@1.1.0` in exported definition files (was `1.0.0`). The 1.1.0 schema adds an upper bound to
  the canvas and component dimensions and is otherwise backward compatible with existing definitions.

## [37] - 2026-06-03

### Fixed

- Preserve opacity and gradient stop offset precision in the SVG export. SVGO's `cleanupNumericValues` plugin rounds
  every numeric attribute to the configured precision, so exporting at precision `0` collapsed normalized 0..1 values
  (`opacity`, `fill-opacity`, `stroke-opacity`, `stop-opacity`, `flood-opacity`, `offset`) to `0` or `1` and made them
  useless. The exporter now uses a custom drop-in replacement that keeps these attributes at a usable minimum precision
  while still rounding all other values to the configured precision.

## [36] - 2026-05-26

### Fixed

- Stabilize filter-primitive identifiers in the SVG export. Figma appends its internal node ids to `result` / `in` /
  `in2` values on filter primitives (e.g. `effect1_foregroundBlur_2072_38`), which change between exports and produce
  noisy diffs in generated definition files. SVGO leaves these values alone because they are not `id` attributes. The
  exporter now renames every `result` to a deterministic, filter-scoped name (`r0`, `r1`, …) and rewrites the
  corresponding `in` / `in2` references. Standard inputs such as `SourceGraphic` and `SourceAlpha` are left untouched.
