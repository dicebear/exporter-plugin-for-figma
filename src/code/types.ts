export type FrameSettings = {
  dicebearVersion: string;
  title: string;
  packageName: string;
  packageVersion: string;
  creator: string;
  homepage: string;
  sourceTitle: string;
  source: string;
  licenseName: string;
  licenseUrl: string;
  licenseText: string;
  backgroundColorGroupName: string;
  shapeRendering: string;
  onPreCreateHook: string;
  onPostCreateHook: string;
  precision: number;
  fileShareUrl: string;
};

export type ComponentGroupSettings = {
  defaults: Record<string, boolean>;
  probability: number | null;
  rotation: number | null;
  offsetX: number | null;
  offsetY: number | null;
};

export type ColorGroupSettings = {
  notEqualTo: Record<string, boolean>;
  contrastTo: string | null;
};

export type ExportComponent = {
  id: string;
  name: string;
};

export type ExportColor = {
  id: string;
  name: string;
  value: string;
};

export type ExportComponentGroup = {
  settings: ComponentGroupSettings;
  collection: Record<string, ExportComponent>;
  width: number;
  height: number;
};

export type ExportColorGroup = {
  settings: ColorGroupSettings;
  isUsedByComponents: boolean;
  collection: Record<string, ExportColor>;
};

export type Export = {
  frame: {
    id: string;
    settings: FrameSettings;
  };
  components: Record<string, ExportComponentGroup>;
  colors: Record<string, ExportColorGroup>;
};

export type NodeExportInfo = {
  matrix?: {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  };
  scale?: {
    x: number;
    y: number;
  };
  fillColorGroup?: string;
  strokeColorGroup?: string;
  componentGroup?: string;
};

export type DefinitionComponents = Array<{
  name: string;
  width: number;
  height: number;
  probability?: number;
  rotation?: number[];
  offset?: {
    x?: number[];
    y?: number[];
  };
  values: Array<{
    name: string;
    default?: boolean;
    content: string;
  }>;
}>;

export type DefinitionColors = Array<{
  name: string;
  values: string[];
  notEqualTo?: string[];
  contrastTo?: string;
}>;
