import type { Paragraph, ProofParagraphDTO } from '../types'

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

export interface ProofDTO {
  hash: string
  label: string
  paragraphs: ProofParagraphDTO[]
}

let proofFetchAttempts = 0

const normForHash = (text: string) => text.replace(/\s+/g, '')
const hashProof = (paragraphs: ProofParagraphDTO[]): string => {
  let h = 5381
  for (const paragraph of paragraphs) {
    const seed = `${paragraph.number}|${normForHash(paragraph.text)}`
    for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  }
  return `proof-${h.toString(36)}`
}

const typesetCopyEdit = (text: string): string => text
  .replace('近年来，', '近年，')
  .replace('但其在真实维护工作流中的影响仍缺少系统证据', '但其在真实维护工作流中的实际影响仍缺少系统证据')
  .replace('编码过程由两名研究者独立完成。', '编码过程由两名研究者独立完成，编码一致性以 Cohen\'s κ 系数检验。')
  .replace('认知负担', '认知负荷')

export const fetchProof = async (reviewParagraphs: Paragraph[]): Promise<ProofDTO> => {
  await wait(700)
  proofFetchAttempts += 1
  if (proofFetchAttempts === 1) {
    throw new Error('校样服务暂时不可用，校样文件拉取失败；审阅台正文未受影响，请重试对账')
  }
  const paragraphs: ProofParagraphDTO[] = []
  for (const paragraph of reviewParagraphs) {
    switch (paragraph.id) {
      case 'p-01':
      case 'p-03':
        paragraphs.push({ id: `proof-${paragraph.id}`, number: paragraph.number, text: paragraph.original })
        break
      case 'p-02':
      case 'p-04':
      case 'p-06':
        paragraphs.push({ id: `proof-${paragraph.id}`, number: paragraph.number, text: typesetCopyEdit(paragraph.original) })
        break
      case 'p-05':
        paragraphs.push({ id: 'proof-p-05-a', number: paragraph.number, text: '当编码结果不一致时，研究者通过讨论达成一致。' })
        paragraphs.push({ id: 'proof-p-05-b', number: '5.1', text: '若仍有分歧，则邀请第三位研究者裁决。' })
        break
      case 'p-07':
        break
      default:
        paragraphs.push({ id: `proof-${paragraph.id}`, number: paragraph.number, text: paragraph.original })
    }
  }
  return { hash: hashProof(paragraphs), label: '期刊校样（排版稿）', paragraphs }
}

