import type { Paragraph } from '../types'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export interface RemotePatch {
  accepted: boolean
  paragraphId: string
  remoteText: string
  remoteAuthor: string
  serverRevision: number
}

export const submitRemotePatch = async (paragraph: Paragraph): Promise<RemotePatch> => {
  await wait(650)
  const remoteText = paragraph.text.includes('然而')
    ? paragraph.text.replace('然而', '但是')
    : `${paragraph.text.replace(/。$/, '')}。作者补充：该结论仅适用于本次样本。`
  return {
    accepted: true,
    paragraphId: paragraph.id,
    remoteText,
    remoteAuthor: '协作者 · 王教授',
    serverRevision: Math.floor(Date.now() / 1000),
  }
}

export interface ProofParagraph {
  /** 对应的审阅台段落 id；同一段出现多次表示排版把段落拆开了 */
  sourceId: string
  text: string
}

export interface ProofDocument {
  id: string
  label: string
  /** 排版所依据的送排基线版本 id */
  baselineVersionId: string
  paragraphs: ProofParagraph[]
}

export const LATEST_PROOF_META = { id: 'proof-ms20260417-r1', label: '期刊校样 · 排版回稿 R1' }

/**
 * 排版回稿：基于「审阅基线 v2」。
 * p-02/p-03 排版润色；p-04 排版未动（作者在审阅台删了预注册那句）；
 * p-05 被拆成两段；p-06 整段拿掉；p-07 排版在旧稿上做了润色（作者也在审阅台改过）。
 */
const LATEST_PROOF: ProofDocument = {
  id: LATEST_PROOF_META.id,
  label: LATEST_PROOF_META.label,
  baselineVersionId: 'v-02',
  paragraphs: [
    { sourceId: 'p-01', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。' },
    { sourceId: 'p-02', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺乏系统性证据。' },
    { sourceId: 'p-03', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈了 26 位核心维护者。' },
    { sourceId: 'p-04', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。 编码规则在预注册方案中说明。' },
    { sourceId: 'p-05', text: '当编码结果不一致时，研究者通过讨论达成一致。' },
    { sourceId: 'p-05', text: '若仍有分歧，则邀请第三位研究者裁决。' },
    { sourceId: 'p-07', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成的速度。' },
  ],
}

const attemptedProofs = new Set<string>()

/** 重置演示状态，让下一次导入重新模拟一次失败 */
export const resetProofMock = () => attemptedProofs.clear()

export const fetchLatestProof = async (): Promise<ProofDocument> => {
  await wait(700)
  // 演示「对账失败 → 守住审阅台 → 重试」：每轮演示的第一次导入失败一次
  if (!attemptedProofs.has(LATEST_PROOF_META.id)) {
    attemptedProofs.add(LATEST_PROOF_META.id)
    throw new Error('校样服务暂时不可用')
  }
  return JSON.parse(JSON.stringify(LATEST_PROOF)) as ProofDocument
}
