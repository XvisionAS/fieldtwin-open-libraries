declare module "@xvisionas/profile-tools" {

  export interface Point {
    x: number;
    y: number;
    z: number;
  }
  export type FlatPoint = [
    number, number, number
  ];

  export interface WellBoreFrom {
    depth: number;
    depthType: 'MD' | 'TVD';
  }

  export type ProfileType = 'default' | 'raw' | 'sampled' | 'keepSurvey';

  export interface ProfileOptions {
    profileType?: ProfileType;
    sampleWidth?: number;
    minimumPoints?: number;
    minimumSurveyPoints?: number;
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
    from?: WellBoreFrom;
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
    unit: string;
    profiles: Array<ExportedProfile>;
  }

  /* Package exports */

  export function simplify(
    points: Array<Point>,
    tolerance: number,
    highestQuality: boolean
  ): Array<Point>;

  export class ProfileExporter {
    constructor(backendURL: string);
    setJWT(jwt: string): void;
    setAPIToken(token: string): void;
    getWellExportBore(well: object): object|undefined;
    connectionIsImported(conn: object): boolean;
    exportProfiles(
      path: Path,
      metadataIds: MetaDataRefs,
      options: ProfileOptions,
      projectId: string,
      subProjectId: string,
      streamId?: string
    ): Promise<ExportedProfiles>;
  }
}
