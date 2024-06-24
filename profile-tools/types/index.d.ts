declare module "@xvisionas/profile-tools" {

  export interface Point {
    x: number;
    y: number;
    z: number;
  }
  export type FlatPoint = [
    number, number, number
  ];

  export type ProfileType = 'default' | 'sampled';

  export interface ProfileOptions {
    profileType?: ProfileType;
    sampleWidth?: number;
    minimumPoints?: number;
    relativePoints?: boolean;
    simplify?: boolean;
    simplifyTolerance?: number;
  }

  export interface ObjectAttribute {
    metaDatumId: string;
    name: string;
    value: string | number | boolean | undefined;
    unit: string;
  }

  /**
   * Only one of the possible IDs is required.
   */
  interface MetaDatumRef {
    metaDatumId?: string;
    vendorId?: string;
    definitionId?: string;
  }

  export type MetaDataRefs = Array<MetaDatumRef>;

  /**
   * A path item that is compatible with the output from graph-resolver.
   */
  interface IPathItem {
    id: string;
    name: string;
    type: "connection" | "well" | "stagedAsset";
  }

  export type Path = Array<IPathItem>;

  export interface ExportedProfile {
    id: string;
    type: "connection" | "well";
    name: string;
    simplified: boolean;
    profile: Array<FlatPoint>;
    attributes: Array<ObjectAttribute>;
  }

  export interface ExportedProfiles {
    projectId: string;
    subProjectId: string;
    streamId?: string;
    CRS?: string;
    profiles: Array<ExportedProfile>;
  }
}
