export type FrameSettings = {
  title: string;
  packageName: string;
  packageVersion: string;
  creator: string;
  homepage: string;
  sourceTitle: string;
  source: string;
  licenseName: string;
  licenseUrl: string;
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
