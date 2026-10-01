import type { Paragraph, ReconcileEntry } from '../types'
import type { ProofDocument } from './mockApi'

const variantId = () => `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
/** 比较前做空白归一，排版带来的空格/换行差异不算改动 */
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

export interface ReconcileResult {
  entries: ReconcileEntry[]
  paragraphs: Paragraph[]
}

/**
 * 校样按段落与审阅台正文对账（三方对比：送排基线 / 审阅台当前 / 校样）。
 * - 只有排版动过的段落：直接套用校样文字；
 * - 只有作者动过的段落：保留审阅台版本，校样写法收进段落 variants 供对照；
 * - 两边都动过的段落：正文不动，登记为待裁定，由作者二选一；
 * - 排版拆段 / 整段删除：只登记挂起，正文一律不动，等编辑处理。
 * 同一校样重复对账是幂等的：条目 id 由校样 id + 段落 id 决定，不会重复建段。
 */
export const reconcileProof = (proof: ProofDocument, baseline: Paragraph[], paragraphs: Paragraph[]): ReconcileResult => {
  const partsBySource = new Map<string, string[]>()
  proof.paragraphs.forEach((part) => {
    const list = partsBySource.get(part.sourceId) ?? []
    list.push(part.text)
    partsBySource.set(part.sourceId, list)
  })

  const entries: ReconcileEntry[] = []
  const next = paragraphs.map((paragraph) => ({ ...paragraph, variants: [...paragraph.variants] }))
  const byId = new Map(next.map((paragraph) => [paragraph.id, paragraph]))

  const attachProofVariant = (paragraphId: string, text: string, note: string) => {
    const paragraph = byId.get(paragraphId)
    if (!paragraph || paragraph.variants.some((variant) => normalize(variant.text) === normalize(text))) return
    paragraph.variants.push({ id: variantId(), text, source: 'proof', note, createdAt: Date.now() })
  }

  baseline.forEach((baseParagraph) => {
    const current = byId.get(baseParagraph.id)
    // 审阅台已没有这一段（此前的删除/拆分已处理完），跳过，避免重复建段
    if (!current) return
    const parts = partsBySource.get(baseParagraph.id) ?? []
    const entry: ReconcileEntry = {
      id: `${proof.id}:${baseParagraph.id}`,
      proofId: proof.id,
      paragraphId: baseParagraph.id,
      decision: 'same',
      status: 'resolved',
      baseText: baseParagraph.text,
      reviewText: current.text,
      proofText: parts.join('\n'),
    }

    if (parts.length === 0) {
      entries.push({ ...entry, decision: 'removed', status: 'suspended', proofText: '', note: '排版在校样中整段删除，已挂起，待编辑处理' })
      return
    }
    if (parts.length > 1) {
      entries.push({ ...entry, decision: 'split', status: 'suspended', proofParts: parts, note: `排版将本段拆为 ${parts.length} 段，已挂起，待编辑处理` })
      return
    }

    const proofText = parts[0]
    const base = normalize(baseParagraph.text)
    const local = normalize(current.text)
    const remote = normalize(proofText)

    if (remote === base && local === base) {
      entries.push({ ...entry, proofText, note: '双方均未改动' })
    } else if (remote !== base && local === base) {
      current.text = proofText
      current.highlighted = true
      entries.push({ ...entry, decision: 'proof-only', proofText, resolvedWith: 'proof', note: '排版改动，已套用校样文字' })
    } else if (remote === base && local !== base) {
      attachProofVariant(baseParagraph.id, proofText, '校样写法 · 排版未改动，摆旁边对照')
      entries.push({ ...entry, decision: 'local-only', proofText, resolvedWith: 'review', note: '作者在审阅台改过，保留审阅台版本，校样写法摆旁边对照' })
    } else if (remote === local) {
      entries.push({ ...entry, proofText, note: '双方修改一致' })
    } else {
      entries.push({ ...entry, decision: 'both', status: 'pending', proofText, note: '双方改动不一致，并排保留两版，待作者裁定' })
    }
  })

  return { entries, paragraphs: next }
}
