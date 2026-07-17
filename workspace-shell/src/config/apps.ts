import type { ApplicationCategory, WorkspaceApplication } from '../types'

export const applicationCategories: Array<{ id: ApplicationCategory; label: string; description: string }> = [
  { id: 'workspace', label: 'Workspace', description: 'Shared work, knowledge and everyday execution.' },
  { id: 'operations', label: 'Business operations', description: 'Specialist systems that keep delivery moving.' },
  { id: 'websites', label: 'Brands & websites', description: 'Closing Gap businesses, ventures and public destinations.' },
]

export const categoryLabel = (category: ApplicationCategory) => applicationCategories.find((item) => item.id === category)?.label || category

export const workspaceApplications: WorkspaceApplication[] = [
  {
    id: 'todo', name: 'To-Do', description: 'Daily priorities, task ownership and team execution.',
    category: 'workspace', kind: 'native', route: '/todo', folderPath: 'todo (2)', accent: '#246bfe',
    status: 'Native', metric: 'Board, calendar, focus and reporting', enabled: true, featured: true, glyph: 'TD',
  },
  {
    id: 'vault', name: 'Vault', description: 'Company knowledge, SOPs, contracts, templates and brand assets.',
    category: 'workspace', kind: 'native', route: '/vault', accent: '#111111', status: 'Native',
    metric: 'Documents, credentials and knowledge', enabled: true, featured: true, glyph: 'VT',
  },
  {
    id: 'cg-studio', name: 'CG Studio', description: 'Creative production, poster workflows and client content.',
    category: 'operations', kind: 'tool', externalUrl: import.meta.env.VITE_CG_STUDIO_URL || undefined,
    folderPath: 'cgstudio', accent: '#014641', status: import.meta.env.VITE_CG_STUDIO_URL ? 'Connected' : 'Coming soon',
    metric: 'Creative production workspace', enabled: Boolean(import.meta.env.VITE_CG_STUDIO_URL), glyph: 'CG',
  },
  {
    id: 'finora', name: 'Finora', description: 'Invoices, quotations, expenses and payment tracking.',
    category: 'operations', kind: 'tool', externalUrl: import.meta.env.VITE_FINORA_URL || undefined,
    folderPath: 'Finora', accent: '#91d632', status: import.meta.env.VITE_FINORA_URL ? 'Connected' : 'Coming soon',
    metric: 'Finance and billing workspace', enabled: Boolean(import.meta.env.VITE_FINORA_URL), glyph: 'FN',
  },
  {
    id: 'truhyre', name: 'TruHyre', description: 'Jobs, candidates, clients and recruitment delivery.',
    category: 'operations', kind: 'tool', externalUrl: import.meta.env.VITE_TRUHYRE_URL || undefined,
    accent: '#b5121b', status: import.meta.env.VITE_TRUHYRE_URL ? 'Connected' : 'Coming soon',
    metric: 'Recruitment delivery workspace', enabled: Boolean(import.meta.env.VITE_TRUHYRE_URL), glyph: 'TH',
  },
  {
    id: 'growth-engine', name: 'Growth Engine', description: 'Leads, clients, follow-ups and growth operations.',
    category: 'operations', kind: 'tool', externalUrl: import.meta.env.VITE_GROWTH_ENGINE_URL || undefined,
    accent: '#e87929', status: import.meta.env.VITE_GROWTH_ENGINE_URL ? 'Connected' : 'Coming soon',
    metric: 'Lead and client operations', enabled: Boolean(import.meta.env.VITE_GROWTH_ENGINE_URL), glyph: 'GE',
  },
  {
    id: 'prospector', name: 'Prospector', description: 'Build targeted Instagram lead lists by location and business category.',
    category: 'operations', kind: 'tool', externalUrl: 'https://prospector-cg.vercel.app/', accent: '#635bff',
    status: 'Connected', metric: 'Instagram lead generation', enabled: true, featured: true, glyph: 'PR',
  },
  {
    id: 'cw-watch', name: 'CW Watch', description: 'Monitor removed UK sponsor licences and review watchlist changes.',
    category: 'operations', kind: 'tool', externalUrl: 'https://ch-watch-cg.vercel.app/', accent: '#d64b32',
    status: 'Connected', metric: 'Sponsor licence monitoring', enabled: true, featured: true, glyph: 'CW',
  },
  {
    id: 'mitdir', name: 'MitDir', description: 'Trusted everyday assistance for older adults and their families.',
    category: 'websites', kind: 'website', externalUrl: 'https://mitdir-withyou-cg.vercel.app/', accent: '#e39a58',
    status: 'Website', metric: 'Everyday help and family support', enabled: true, glyph: 'MD',
  },
  {
    id: 'crestfield', name: 'Crestfield', description: 'Professional education in applied intelligence, data and cyber security.',
    category: 'websites', kind: 'website', externalUrl: 'https://crestfield-cg.vercel.app/', accent: '#1c67a8',
    status: 'Website', metric: 'Professional education and careers', enabled: true, glyph: 'CF',
  },
  {
    id: 'closing-gap', name: 'Closing Gap', description: 'The public home of Closing Gap and its 360-degree business solutions.',
    category: 'websites', kind: 'website', externalUrl: 'https://theclosinggap.net/', accent: '#b7ff4a',
    status: 'Website', metric: 'Company website', enabled: true, glyph: 'CG',
  },
]
