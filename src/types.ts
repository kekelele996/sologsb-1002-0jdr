export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
export type CommentType = 'comment' | 'suggestion'

export type ProofStatus = 'matched' | 'use-proof' | 'keep-review' | 'conflict' | 'split' | 'removed' | 'added'
export type ProofDecision = 'accept-split' | 'keep-review' | 'confirm-remove' | 'keep-paragraph' | 'accept-add' | 'ignore-add'

export interface ProofVariant {
  id: string
  label: string
  text: string
  source: 'review' | 'proof'
  active: boolean
}

export interface ProofParagraphDTO {
  id: string
  number: string
  text: string
}

export interface ReconcileItem {
  id: string
  reviewParagraphId?: string
  proofParagraphIds: string[]
  status: ProofStatus
  reviewText?: string
  proofText?: string
  proofTexts?: string[]
  resolved?: boolean
  resolution?: ProofDecision
}

export interface ProofRecord {
  id: string
  hash: string | null
  label: string
  importedAt: number
  status: 'reconciling' | 'done' | 'failed'
  error?: string
  paragraphs: ProofParagraphDTO[]
  items: ReconcileItem[]
}

export interface Reply {
  id: string
  author: string
  role: Role
  body: string
  createdAt: number
}

export interface Comment {
  id: string
  paragraphId: string
  author: string
  role: Role
  type: CommentType
  quote: string
  body: string
  suggestion?: string
  status: CommentStatus
  replies: Reply[]
  createdAt: number
  mergedInto?: string
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
  proofState?: ProofStatus
  proofVariants?: ProofVariant[]
  proofSuspended?: boolean
}

export interface Version {
  id: string
  label: string
  createdAt: number
  paragraphs: Paragraph[]
}

export interface EditConflict {
  id: string
  paragraphId: string
  localText: string
  remoteText: string
  localAuthor: string
  remoteAuthor: string
  detectedAt: number
}

export interface HistorySnapshot {
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
}
