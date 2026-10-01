import { create } from 'zustand'
import type { Comment, EditConflict, HistorySnapshot, Paragraph, ProofRecord, ReconcileEntry, Reply, Role, Version } from '../types'
import { fetchLatestProof, LATEST_PROOF_META, resetProofMock } from '../services/mockApi'
import { reconcileProof } from '../services/reconcile'

const DRAFT_KEY = 'sologsb-1002-draft-v1'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false, variants: [] },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true, variants: [] },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true, variants: [] },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false, variants: [] },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true, variants: [] },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', status: 'open', highlighted: true, variants: [] },
  // 送排之后作者在审阅台又改过的一段（original 仍是送排稿），用于演示「双方都改过」
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证、能否落地复现，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false, variants: [] },
]
const baseComments: Comment[] = [
  { id: 'c-01', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion', quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察指标。', suggestion: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', status: 'open', replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }], createdAt: Date.now() - 86400000 },
  { id: 'c-02', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  { id: 'c-06', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion', quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量。', suggestion: '初步结果显示，辅助工具缩短了首次响应时间，但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。', status: 'open', replies: [], createdAt: Date.now() - 36000000 },
]

const normalizeParagraphs = (list: Paragraph[] | undefined, fallback: Paragraph[]) =>
  (list?.length ? list : fallback).map((paragraph) => ({ ...paragraph, variants: paragraph.variants ?? [] }))

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed = seed ? JSON.parse(seed) as Partial<HistorySnapshot> : null
const initialParagraphs = normalizeParagraphs(parsed?.paragraphs, baseParagraphs)
const initialComments = parsed?.comments ?? baseComments
// 送排基线：p-04 带着预注册那句、 p-07 仍是作者改动前的写法
const submittedSnapshot = (mutate: (paragraph: Paragraph) => Paragraph) =>
  baseParagraphs.map((paragraph) => mutate(paragraph.id === 'p-07' ? { ...paragraph, text: paragraph.original } : { ...paragraph }))
const initialVersions: Version[] = (parsed?.versions ?? [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: submittedSnapshot((paragraph) => paragraph) },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: submittedSnapshot((paragraph) => paragraph.id === 'p-04' ? { ...paragraph, text: `${paragraph.text} 编码规则在预注册方案中说明。` } : paragraph) },
]).map((version) => ({ ...version, paragraphs: normalizeParagraphs(version.paragraphs, []) }))
const initialProofs = parsed?.proofs ?? []
const initialReconcileEntries = parsed?.reconcileEntries ?? []

const persistDraft = (snapshot: HistorySnapshot) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot))
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const renumber = (list: Paragraph[]) => list.map((paragraph, index) => ({ ...paragraph, number: `${index + 1}.` }))

interface ReviewState {
  role: Role
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  proofs: ProofRecord[]
  reconcileEntries: ReconcileEntry[]
  proofImporting: boolean
  selectedParagraphId: string
  commentFilter: 'all' | 'open' | 'suggestion' | 'duplicate'
  revisionMode: boolean
  dirty: boolean
  conflicts: EditConflict[]
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  setRole: (role: Role) => void
  selectParagraph: (id: string) => void
  setCommentFilter: (filter: ReviewState['commentFilter']) => void
  setRevisionMode: (value: boolean) => void
  updateParagraph: (id: string, text: string) => void
  addComment: (input: Pick<Comment, 'paragraphId' | 'type' | 'quote' | 'body' | 'suggestion'>) => void
  replyComment: (commentId: string, body: string) => void
  resolveSuggestion: (commentId: string, accepted: boolean) => void
  mergeComment: (commentId: string, targetId: string) => void
  toggleLock: (paragraphId: string) => void
  createVersion: (label: string) => void
  addConflict: (conflict: EditConflict) => void
  resolveConflict: (conflictId: string, strategy: 'local' | 'remote') => void
  dismissConflict: (conflictId: string) => void
  importProof: () => Promise<'ok' | 'duplicate' | 'failed'>
  resolveReconcileEntry: (entryId: string, choice: 'proof' | 'review') => void
  resolveSplit: (entryId: string, accept: boolean) => void
  resolveRemoved: (entryId: string, confirm: boolean) => void
  swapParagraphVariant: (paragraphId: string, variantId: string) => void
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  const snapshotOf = (state: ReviewState): HistorySnapshot => ({
    paragraphs: clone(state.paragraphs),
    comments: clone(state.comments),
    versions: clone(state.versions),
    proofs: clone(state.proofs),
    reconcileEntries: clone(state.reconcileEntries),
  })
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = snapshotOf(state)
    const next = producer(state)
    const snapshot: HistorySnapshot = {
      paragraphs: next.paragraphs ?? state.paragraphs,
      comments: next.comments ?? state.comments,
      versions: next.versions ?? state.versions,
      proofs: next.proofs ?? state.proofs,
      reconcileEntries: next.reconcileEntries ?? state.reconcileEntries,
    }
    persistDraft(snapshot)
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })
  const markEntry = (entries: ReconcileEntry[], entryId: string, patch: Partial<ReconcileEntry>) =>
    entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry)

  return {
    role: 'reviewer',
    paragraphs: initialParagraphs,
    comments: initialComments,
    versions: initialVersions,
    proofs: initialProofs,
    reconcileEntries: initialReconcileEntries,
    proofImporting: false,
    selectedParagraphId: 'p-02',
    commentFilter: 'all',
    revisionMode: false,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    setRole: (role) => set({ role, selectedParagraphId: get().paragraphs[0]?.id ?? '' }),
    selectParagraph: (selectedParagraphId) => set({ selectedParagraphId }),
    setCommentFilter: (commentFilter) => set({ commentFilter }),
    setRevisionMode: (revisionMode) => set({ revisionMode }),
    updateParagraph: (paragraphId, text) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId && paragraph.status !== 'locked'
        ? { ...paragraph, text, status: 'open' as const, highlighted: true }
        : paragraph),
    })),
    addComment: (input) => record((state) => ({
      comments: [{
        ...input,
        id: id('comment'),
        author: state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑',
        role: state.role,
        status: 'open',
        replies: [],
        createdAt: Date.now(),
      }, ...state.comments],
    })),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
    })),
    resolveSuggestion: (commentId, accepted) => record((state) => {
      const comment = state.comments.find((item) => item.id === commentId)
      return {
        comments: state.comments.map((item) => item.id === commentId ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item),
        paragraphs: comment?.suggestion && accepted
          ? state.paragraphs.map((paragraph) => paragraph.id === comment.paragraphId ? { ...paragraph, text: comment.suggestion as string, status: 'accepted' } : paragraph)
          : state.paragraphs,
      }
    }),
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged', mergedInto: targetId } : comment),
    })),
    toggleLock: (paragraphId) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId ? {
        ...paragraph,
        status: paragraph.status === 'locked' ? 'accepted' : 'locked',
      } : paragraph),
    })),
    createVersion: (label) => record((state) => ({
      versions: [{ id: id('version'), label: label.trim() || `版本 ${state.versions.length + 1}`, createdAt: Date.now(), paragraphs: clone(state.paragraphs) }, ...state.versions],
    })),
    addConflict: (conflict) => set((state) => ({ conflicts: [conflict, ...state.conflicts] })),
    resolveConflict: (conflictId, strategy) => record((state) => {
      const conflict = state.conflicts.find((item) => item.id === conflictId)
      return {
        paragraphs: conflict && strategy === 'remote'
          ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId ? { ...paragraph, text: conflict.remoteText, highlighted: true } : paragraph)
          : state.paragraphs,
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
    importProof: async () => {
      const state = get()
      if (state.proofImporting) return 'failed'
      // 同一份校样已导入过：直接跳过，不重复对账、不重复建段
      if (state.proofs.some((proof) => proof.id === LATEST_PROOF_META.id && proof.status === 'ok')) return 'duplicate'
      set({ proofImporting: true })
      try {
        const proof = await fetchLatestProof()
        const current = get()
        const baseline = current.versions.find((version) => version.id === proof.baselineVersionId) ?? current.versions[0]
        if (!baseline) throw new Error('缺少送排基线版本')
        const { entries, paragraphs } = reconcileProof(proof, baseline.paragraphs, current.paragraphs)
        record((latest) => ({
          paragraphs,
          reconcileEntries: [...latest.reconcileEntries.filter((entry) => entry.proofId !== proof.id), ...entries],
          proofs: [{ id: proof.id, label: proof.label, baselineVersionId: proof.baselineVersionId, importedAt: Date.now(), status: 'ok' as const }, ...latest.proofs.filter((item) => item.id !== proof.id)],
        }))
        set({ proofImporting: false })
        return 'ok'
      } catch (error) {
        // 对账失败：正文不动，守住审阅台这一版，只记下失败可重试
        const messageText = error instanceof Error ? error.message : '校样对账失败'
        set((latest) => {
          const proofs = [{ id: LATEST_PROOF_META.id, label: LATEST_PROOF_META.label, baselineVersionId: 'v-02', importedAt: Date.now(), status: 'failed' as const, error: messageText }, ...latest.proofs.filter((item) => item.id !== LATEST_PROOF_META.id)]
          persistDraft({ ...snapshotOf(latest), proofs })
          return { proofs, proofImporting: false }
        })
        return 'failed'
      }
    },
    resolveReconcileEntry: (entryId, choice) => record((state) => {
      const entry = state.reconcileEntries.find((item) => item.id === entryId)
      if (!entry || entry.decision !== 'both' || entry.status !== 'pending') return {}
      const paragraphs = state.paragraphs.map((paragraph) => {
        if (paragraph.id !== entry.paragraphId) return paragraph
        const proofVariant = paragraph.variants.find((variant) => variant.text === entry.proofText)
        if (choice === 'proof') {
          // 采用校样：当前正文（落选版）收进段落，还能调回来
          return {
            ...paragraph,
            text: entry.proofText,
            highlighted: true,
            variants: [
              ...paragraph.variants.filter((variant) => variant.id !== proofVariant?.id && variant.text !== paragraph.text),
              { id: id('variant'), text: paragraph.text, source: 'review' as const, note: '审阅台修订 · 落选保留', createdAt: Date.now() },
            ],
          }
        }
        // 保留审阅台：校样写法收进段落，还能调回来
        return {
          ...paragraph,
          variants: proofVariant
            ? paragraph.variants.map((variant) => variant.id === proofVariant.id ? { ...variant, note: '校样写法 · 落选保留' } : variant)
            : [...paragraph.variants, { id: id('variant'), text: entry.proofText, source: 'proof' as const, note: '校样写法 · 落选保留', createdAt: Date.now() }],
        }
      })
      return { paragraphs, reconcileEntries: markEntry(state.reconcileEntries, entryId, { status: 'resolved', resolvedWith: choice }) }
    }),
    resolveSplit: (entryId, accept) => record((state) => {
      const entry = state.reconcileEntries.find((item) => item.id === entryId)
      if (!entry || entry.decision !== 'split' || entry.status !== 'suspended' || !entry.proofParts?.length) return {}
      let paragraphs = state.paragraphs
      if (accept) {
        const index = paragraphs.findIndex((paragraph) => paragraph.id === entry.paragraphId)
        if (index >= 0) {
          const source = paragraphs[index]
          // 原段保留为第一段（批注、回复都跟着留下），其余分段插在其后；id 由条目决定，重复执行不会重复建段
          const created = entry.proofParts.slice(1).map((text, partIndex) => ({
            ...source,
            id: `${entry.paragraphId}-split-${partIndex + 2}`,
            text,
            original: text,
            status: 'open' as const,
            highlighted: true,
            variants: [],
          })).filter((paragraph) => !paragraphs.some((item) => item.id === paragraph.id))
          paragraphs = renumber([
            ...paragraphs.slice(0, index),
            { ...source, text: entry.proofParts[0], highlighted: true },
            ...created,
            ...paragraphs.slice(index + 1),
          ])
        }
      }
      return {
        paragraphs,
        reconcileEntries: markEntry(state.reconcileEntries, entryId, { status: 'resolved', resolvedWith: accept ? 'proof' : 'review', note: accept ? '编辑已按校样拆分段落' : '编辑保留原段落，未拆分' }),
      }
    }),
    resolveRemoved: (entryId, confirm) => record((state) => {
      const entry = state.reconcileEntries.find((item) => item.id === entryId)
      if (!entry || entry.decision !== 'removed' || entry.status !== 'suspended') return {}
      return {
        paragraphs: confirm ? renumber(state.paragraphs.filter((paragraph) => paragraph.id !== entry.paragraphId)) : state.paragraphs,
        reconcileEntries: markEntry(state.reconcileEntries, entryId, { status: 'resolved', resolvedWith: confirm ? 'proof' : 'review', note: confirm ? '编辑确认按校样删除，段落上的意见与回复仍保留' : '编辑保留该段落，未按校样删除' }),
      }
    }),
    swapParagraphVariant: (paragraphId, variantId) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => {
        if (paragraph.id !== paragraphId) return paragraph
        const variant = paragraph.variants.find((item) => item.id === variantId)
        if (!variant) return paragraph
        // 换用落选版本：当前正文换下来收进段落，两边都不丢
        return {
          ...paragraph,
          text: variant.text,
          highlighted: true,
          variants: [
            ...paragraph.variants.filter((item) => item.id !== variantId),
            { id: id('variant'), text: paragraph.text, source: 'review' as const, note: '换下的前一版 · 可再换回', createdAt: Date.now() },
          ],
        }
      }),
    })),
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = snapshotOf(state)
      persistDraft(previous)
      return { ...previous, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = snapshotOf(state)
      persistDraft(next)
      return { ...next, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persistDraft(snapshotOf(get()))
      set({ dirty: false })
    },
    resetDemo: () => {
      localStorage.removeItem(DRAFT_KEY)
      resetProofMock()
      const versions = clone(initialVersions)
      const snapshot: HistorySnapshot = { paragraphs: clone(baseParagraphs), comments: clone(baseComments), versions, proofs: [], reconcileEntries: [] }
      set({ ...snapshot, conflicts: [], past: [], future: [], dirty: false, proofImporting: false })
      persistDraft(snapshot)
    },
  }
})
