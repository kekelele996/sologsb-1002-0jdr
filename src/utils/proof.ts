import type { Paragraph, ProofParagraphDTO, ProofStatus, ReconcileItem } from '../types'
import { lcsSimilarity, normText } from './text'

const MATCH_THRESHOLD = 0.55
const SPLIT_CONFIRM = 0.9

let itemSeq = 0
const itemId = (kind: string, index: number) => `ritem-${kind}-${index}-${(itemSeq++).toString(36)}`

interface Decision {
  i: number
  type: 'single' | 'split' | 'none'
  j: number
  s: number
}

export const reconcileProof = (review: Paragraph[], proof: ProofParagraphDTO[]): ReconcileItem[] => {
  const decisions: Decision[] = review.map((reviewParagraph, i) => {
    const reviewText = normText(reviewParagraph.text)
    let bestSingle = { j: -1, s: 0 }
    let bestSplit = { j: -1, s: 0 }
    for (let j = 0; j < proof.length; j++) {
      const singleScore = lcsSimilarity(reviewText, normText(proof[j].text))
      if (singleScore > bestSingle.s) bestSingle = { j, s: singleScore }
      if (j + 1 < proof.length) {
        const concat = proof[j].text + proof[j + 1].text
        const splitScore = lcsSimilarity(reviewText, normText(concat))
        if (splitScore > bestSplit.s) bestSplit = { j, s: splitScore }
      }
    }
    if (bestSplit.j >= 0 && bestSplit.s >= SPLIT_CONFIRM && bestSplit.s > bestSingle.s + 0.05) {
      return { i, type: 'split', j: bestSplit.j, s: bestSplit.s }
    }
    if (bestSingle.j >= 0 && bestSingle.s >= MATCH_THRESHOLD) {
      return { i, type: 'single', j: bestSingle.j, s: bestSingle.s }
    }
    return { i, type: 'none', j: -1, s: 0 }
  })

  const usedReview = new Set<number>()
  const usedProof = new Set<number>()
  const items: ReconcileItem[] = []

  const classify = (reviewParagraph: Paragraph, proofParagraph: ProofParagraphDTO): ProofStatus => {
    const sameText = normText(reviewParagraph.text) === normText(proofParagraph.text)
    const authorTouched = normText(reviewParagraph.text) !== normText(reviewParagraph.original)
    const proofTouched = normText(proofParagraph.text) !== normText(reviewParagraph.original)
    if (sameText) return 'matched'
    if (!authorTouched) return 'use-proof'
    if (!proofTouched) return 'keep-review'
    return 'conflict'
  }

  for (const decision of decisions.filter((entry) => entry.type !== 'none').sort((a, b) => b.s - a.s)) {
    if (usedReview.has(decision.i)) continue
    if (decision.type === 'split') {
      if (usedProof.has(decision.j) || usedProof.has(decision.j + 1)) continue
      usedReview.add(decision.i)
      usedProof.add(decision.j)
      usedProof.add(decision.j + 1)
      items.push({
        id: itemId('split', decision.i),
        reviewParagraphId: review[decision.i].id,
        proofParagraphIds: [proof[decision.j].id, proof[decision.j + 1].id],
        status: 'split',
        reviewText: review[decision.i].text,
        proofTexts: [proof[decision.j].text, proof[decision.j + 1].text],
      })
    } else {
      if (usedProof.has(decision.j)) continue
      usedReview.add(decision.i)
      usedProof.add(decision.j)
      const reviewParagraph = review[decision.i]
      const proofParagraph = proof[decision.j]
      items.push({
        id: itemId('match', decision.i * 100 + decision.j),
        reviewParagraphId: reviewParagraph.id,
        proofParagraphIds: [proofParagraph.id],
        status: classify(reviewParagraph, proofParagraph),
        reviewText: reviewParagraph.text,
        proofText: proofParagraph.text,
      })
    }
  }

  for (let i = 0; i < review.length; i++) {
    if (!usedReview.has(i)) {
      items.push({
        id: itemId('removed', i),
        reviewParagraphId: review[i].id,
        proofParagraphIds: [],
        status: 'removed',
        reviewText: review[i].text,
      })
    }
  }

  for (let j = 0; j < proof.length; j++) {
    if (!usedProof.has(j)) {
      items.push({
        id: itemId('added', j),
        proofParagraphIds: [proof[j].id],
        status: 'added',
        proofText: proof[j].text,
      })
    }
  }

  return items
}

const newParagraphId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const applyProofReconciliation = (paragraphs: Paragraph[], items: ReconcileItem[], proofOrder: string[]): Paragraph[] => {
  let result = [...paragraphs]
  for (const item of items) {
    switch (item.status) {
      case 'matched':
        break
      case 'use-proof':
        result = result.map((paragraph) => paragraph.id === item.reviewParagraphId ? {
          ...paragraph,
          text: item.proofText as string,
          proofState: 'use-proof',
          proofSuspended: false,
          proofVariants: undefined,
          highlighted: true,
        } : paragraph)
        break
      case 'keep-review':
      case 'conflict': {
        const target = result.find((paragraph) => paragraph.id === item.reviewParagraphId)
        if (!target) break
        result = result.map((paragraph) => paragraph.id === item.reviewParagraphId ? {
          ...paragraph,
          proofState: item.status,
          proofSuspended: false,
          proofVariants: [
            { id: `variant-${paragraph.id}-review`, label: '审阅台修订', text: target.text, source: 'review', active: true },
            { id: `variant-${paragraph.id}-proof`, label: '期刊校样', text: item.proofText as string, source: 'proof', active: false },
          ],
        } : paragraph)
        break
      }
      case 'split':
      case 'removed':
        result = result.map((paragraph) => paragraph.id === item.reviewParagraphId ? {
          ...paragraph,
          proofState: item.status,
          proofSuspended: true,
        } : paragraph)
        break
      case 'added': {
        const newParagraph: Paragraph = {
          id: newParagraphId(),
          section: '新增段落',
          number: '＋',
          text: item.proofText as string,
          original: item.proofText as string,
          status: 'open',
          highlighted: true,
          proofState: 'added',
          proofSuspended: true,
        }
        const insertAt = insertIndexForProof(result, items, proofOrder, item.proofParagraphIds[0])
        result = [...result.slice(0, insertAt), newParagraph, ...result.slice(insertAt)]
        break
      }
    }
  }
  return result
}

export const insertIndexForProof = (paragraphs: Paragraph[], items: ReconcileItem[], proofOrder: string[], proofParagraphId: string): number => {
  const idx = proofOrder.indexOf(proofParagraphId)
  for (let k = idx - 1; k >= 0; k--) {
    const previous = items.find((item) => item.proofParagraphIds.length === 1 && item.proofParagraphIds[0] === proofOrder[k] && item.reviewParagraphId)
    if (previous) {
      const reviewIdx = paragraphs.findIndex((paragraph) => paragraph.id === previous.reviewParagraphId)
      if (reviewIdx >= 0) return reviewIdx + 1
    }
  }
  return paragraphs.length
}

export const splitParagraphIntoTwo = (paragraph: Paragraph, proofTexts: string[]): Paragraph[] => proofTexts.map((text, index) => ({
  ...paragraph,
  id: index === 0 ? paragraph.id : newParagraphId(),
  number: index === 0 ? paragraph.number : `${paragraph.number.replace(/\.$/, '')}.${index}`,
  text,
  original: text,
  highlighted: true,
  proofState: 'use-proof',
  proofSuspended: false,
  proofVariants: undefined,
}))
