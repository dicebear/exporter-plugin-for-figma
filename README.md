# DiceBear Studio

A plugin for Figma that brings [DiceBear](https://www.dicebear.com) avatars into your designs. It generates avatars into
your designs and turns a Figma frame of components and color styles into a DiceBear avatar style, and back.

- **Generate.** Fill the selected layers with avatars, or insert a batch of new ones. Pick a style from the DiceBear
  collection or from a definition file you uploaded. Seeds come from a random draw, the layer names, a list, or a
  numbered prefix, and every option of the style is a control in the panel. Filled layers keep their shape and get an
  image fill, inserted avatars are vector frames. Each avatar remembers its style, seed and options, so the relaunch
  buttons on a layer can draw new seeds or swap the style later.
- **Inspect.** Select a generated avatar and get what a developer needs to render the same one: the seed, the changed
  options, the API URL in the format of your choice, and the JavaScript for `@dicebear/core`, each with a copy button.
  Select a frame or group and every avatar inside it is listed.
- **Export.** Turns the frame into a single JSON
  [style definition](https://www.dicebear.com/create-styles/definition-schema/) for DiceBear 11.x, animations included.
- **Import.** Rebuilds a definition file inside an empty Figma file, with one component per variant, the palettes as
  color styles, a generated file thumbnail, a "Start here" guide next to the avatar frame, and a License page with the
  credits of the definition.

The plugin is published on the Figma Community:
[DiceBear Studio](https://www.figma.com/community/plugin/1005765655729342787).

The style collection and its previews come from `api.dicebear.com`, which is the only host the plugin talks to.
Definitions you opened stay cached in Figma's plugin storage, so they render offline.

## Using the plugin

The [DiceBear Studio](https://www.dicebear.com/integrations/figma/) page in the DiceBear docs is the overview: it covers
the Generate and Inspect tabs and points to the two guides for the Style tab.

The first guide covers how to set up the frame, name your components and color groups, and run the export:
[Create an avatar style with Figma](https://www.dicebear.com/create-styles/with-figma/).

The other direction has its own guide, from picking a definition file to exporting the style you made of it:
[Edit an avatar style with Figma](https://www.dicebear.com/create-styles/edit-a-style/).

## Contributing

See [CONTRIBUTING.md](https://github.com/dicebear/studio/blob/main/CONTRIBUTING.md) for local development, build
scripts, and how to load the plugin in Figma from source.

## License

[MIT](https://github.com/dicebear/studio/blob/main/LICENSE).

## Sponsors

Advertisement: Many thanks to our sponsors who provide us with free or discounted products.

<a href="https://bunny.net/" target="_blank" rel="noopener noreferrer">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://www.dicebear.com/sponsors/bunny-light.svg">
        <source media="(prefers-color-scheme: light)" srcset="https://www.dicebear.com/sponsors/bunny-dark.svg">
        <img alt="bunny.net" src="https://www.dicebear.com/sponsors/bunny-dark.svg" height="64">
    </picture>
</a>
