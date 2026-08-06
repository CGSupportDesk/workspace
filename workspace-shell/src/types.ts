export type WorkspaceRole = 'admin' | 'member'

export type ApplicationCategory = 'workspace' | 'operations' | 'websites'

export type WorkspaceUser = {
  id: string
  username: string
  email: string
  role: WorkspaceRole
  active: boolean
  createdAt: string
  updatedAt: string
}

export type WorkspaceApplication = {
  id: string
  name: string
  description: string
  category: ApplicationCategory
  kind: 'native' | 'tool' | 'website'
  route?: string
  externalUrl?: string
  folderPath?: string
  accent: string
  status: string
  metric: string
  enabled: boolean
  featured?: boolean
  glyph: string
}

export type VaultVisibility = 'private' | 'workspace' | 'restricted'

export type VaultDocument = {
  id: string
  name: string
  fileType: string
  fileSize: number
  storagePath?: string
  folderId: string | null
  category: string
  ownerId: string
  ownerName: string
  visibility: VaultVisibility
  favourite: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export type VaultFolder = {
  id: string
  name: string
  parentId: string | null
  ownerId: string
  ownerName: string
  visibility: VaultVisibility
  favourite: boolean
  createdAt: string
  updatedAt: string
}

export type VaultActivity = {
  id: string
  actorName: string
  action: string
  entityType: string
  entityName: string
  createdAt: string
}

export type VaultVersion = {
  id: string
  documentId: string
  version: number
  fileSize: number
  createdByName: string
  createdAt: string
}

export type VaultCredential = {
  id: string
  serviceName: string
  websiteUrl: string
  loginUsername: string
  loginEmail: string
  hasPassword: boolean
  hasNotes: boolean
  ownerId: string
  ownerName: string
  createdAt: string
  updatedAt: string
}

export type VaultAssetType = 'sim' | 'phone' | 'laptop' | 'tablet' | 'accessory' | 'software' | 'other'
export type VaultAssetStatus = 'active' | 'spare' | 'inactive' | 'repair' | 'lost' | 'retired'

export type VaultAsset = {
  id: string
  assetType: VaultAssetType
  name: string
  identifier: string
  registeredOwner: string
  currentOwner: string
  provider: string
  status: VaultAssetStatus
  monthlyCost: number
  renewalDay: number | null
  location: string
  notes: string
  createdByName: string
  createdAt: string
  updatedAt: string
}
