declare module "@xvisionas/graph-resolver" {

  export type PathItemType = "connection" | "well" | "stagedAsset";

  export type Path = Array<IPathItem>;

  export interface IPathItem {
    id: string;
    name: string;
    type: PathItemType;
    isForeign: boolean;
    projectId: string;
    subProjectId: string;
    streamId: string;
  }

  export function findPaths(
    subProject: string,
    startId: string,
    endId?: string,
    categoryId?: string | number
  ): Array<Path>;
}
