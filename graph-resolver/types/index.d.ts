export type PathItemType = 'connection' | 'well' | 'stagedAsset'

export type Path = Array<PathItem>

export interface IPathItem {
    id: string
    name: string
    type: PathItemType
    isForeign: boolean
    projectId: string
    subProjectId: string
    streamId: string
}
