export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
export type CommentType = 'comment' | 'suggestion'

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

export type VariantSource = 'proof' | 'review'

export interface ParagraphVariant {
  id: string
  text: string
  source: VariantSource
  note: string
  createdAt: number
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
  /** 落选/对照版本，收在段落里可随时换回来 */
  variants: ParagraphVariant[]
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
  proofs: ProofRecord[]
  reconcileEntries: ReconcileEntry[]
}

/**
 * 校样对账结论：
 * same       双方都没动（或改得一样）
 * proof-only 只有排版动过 → 用校样文字
 * local-only 只有作者在审阅台改过 → 留审阅台，校样写法摆旁边对照
 * both       两边都碰到 → 并排留两版，作者定一版
 * split      排版把段落拆开 → 挂起等编辑处理
 * removed    排版整段拿掉 → 挂起等编辑处理
 */
export type ReconcileDecision = 'same' | 'proof-only' | 'local-only' | 'both' | 'split' | 'removed'
export type ReconcileStatus = 'pending' | 'resolved' | 'suspended'

export interface ReconcileEntry {
  id: string
  proofId: string
  paragraphId: string
  decision: ReconcileDecision
  status: ReconcileStatus
  baseText: string
  reviewText: string
  proofText: string
  /** 排版拆段时的各个分段 */
  proofParts?: string[]
  resolvedWith?: 'proof' | 'review'
  note?: string
}

export interface ProofRecord {
  id: string
  label: string
  baselineVersionId: string
  importedAt: number
  status: 'ok' | 'failed'
  error?: string
}
