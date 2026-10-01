import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Modal, Space, Spin, Tag, message } from 'antd'
import {
  CheckOutlined, CloseOutlined, CloudDownloadOutlined, ImportOutlined, ReloadOutlined,
  SplitCellsOutlined, DeleteOutlined, PlusOutlined, UndoOutlined,
} from '@ant-design/icons'
import { useReviewStore } from '../store/review'
import { diffChars } from '../utils/text'
import type { ProofStatus, ReconcileItem } from '../types'

const statusMeta: Record<ProofStatus, { label: string; color: string }> = {
  matched: { label: '与校样一致', color: 'default' },
  'use-proof': { label: '排版已改动', color: 'green' },
  'keep-review': { label: '保留审阅台', color: 'blue' },
  conflict: { label: '两版待选', color: 'orange' },
  split: { label: '校样拆分为多段', color: 'gold' },
  removed: { label: '校样删除本段', color: 'red' },
  added: { label: '校样新增段落', color: 'cyan' },
}

const structuralStatuses: ProofStatus[] = ['split', 'removed', 'added']

function DiffText({ reviewText, proofText, mode }: { reviewText?: string; proofText?: string; mode: 'review' | 'proof' }) {
  const result = useMemo(() => diffChars(reviewText ?? '', proofText ?? ''), [reviewText, proofText])
  const segments = mode === 'review' ? result.a : result.b
  return (
    <p className="diff-text">
      {segments.map((segment, index) => {
        if (segment.type === 'same') return <span key={index}>{segment.text}</span>
        if (segment.type === 'del') return <del key={index}>{segment.text}</del>
        return <ins key={index}>{segment.text}</ins>
      })}
    </p>
  )
}

function ItemActions({ item, recordId }: { item: ReconcileItem; recordId: string }) {
  const role = useReviewStore((state) => state.role)
  const paragraphs = useReviewStore((state) => state.paragraphs)
  const activateProofVariant = useReviewStore((state) => state.activateProofVariant)
  const resolveProofItem = useReviewStore((state) => state.resolveProofItem)
  const paragraph = paragraphs.find((entry) => entry.id === item.reviewParagraphId)
  const isAuthor = role === 'author'
  const isEditor = role === 'editor'

  if (item.resolved) return <Tag color="default">已处理</Tag>

  if (item.status === 'conflict' || item.status === 'keep-review') {
    if (!isAuthor) return <span className="proof-role-hint">作者可选定版本</span>
    return (
      <div className="proof-item-actions">
        {item.status === 'conflict' && (
          <Button size="small" icon={<UndoOutlined />} onClick={() => {
            const reviewVariant = paragraph?.proofVariants?.find((variant) => variant.source === 'review')
            if (paragraph && reviewVariant) activateProofVariant(paragraph.id, reviewVariant.id)
          }}>采用审阅台版</Button>
        )}
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => {
          const proofVariant = paragraph?.proofVariants?.find((variant) => variant.source === 'proof')
          if (paragraph && proofVariant) activateProofVariant(paragraph.id, proofVariant.id)
        }}>采用校样版</Button>
      </div>
    )
  }

  if (item.status === 'split') {
    if (!isEditor) return <span className="proof-role-hint">待编辑处理</span>
    return (
      <div className="proof-item-actions">
        <Button size="small" type="primary" icon={<SplitCellsOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'accept-split')}>采用校样拆为{ item.proofTexts?.length ?? 2 }段</Button>
        <Button size="small" icon={<UndoOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'keep-review')}>保留审阅台段落</Button>
      </div>
    )
  }

  if (item.status === 'removed') {
    if (!isEditor) return <span className="proof-role-hint">待编辑处理</span>
    return (
      <div className="proof-item-actions">
        <Button size="small" danger type="primary" icon={<DeleteOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'confirm-remove')}>确认删除</Button>
        <Button size="small" icon={<UndoOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'keep-paragraph')}>保留段落</Button>
      </div>
    )
  }

  if (item.status === 'added') {
    if (!isEditor) return <span className="proof-role-hint">待编辑处理</span>
    return (
      <div className="proof-item-actions">
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'accept-add')}>加入正文</Button>
        <Button size="small" icon={<CloseOutlined />} onClick={() => resolveProofItem(recordId, item.id, 'ignore-add')}>忽略</Button>
      </div>
    )
  }

  return null
}

function ProofItemCard({ item, recordId }: { item: ReconcileItem; recordId: string }) {
  const paragraphs = useReviewStore((state) => state.paragraphs)
  const proofRecord = useReviewStore((state) => state.proofs.find((entry) => entry.id === recordId))
  const paragraph = paragraphs.find((entry) => entry.id === item.reviewParagraphId)
  const proofParagraph = proofRecord?.paragraphs.find((entry) => entry.id === item.proofParagraphIds[0])
  const number = paragraph?.number ?? proofParagraph?.number ?? '—'

  return (
    <div className={`proof-item-card ${item.resolved ? 'resolved' : ''}`}>
      <div className="proof-item-head">
        <Tag color={statusMeta[item.status].color}>{statusMeta[item.status].label}</Tag>
        <span>段落 {number}</span>
        {item.resolution && <Tag>已处理</Tag>}
      </div>
      {item.status === 'removed' ? (
        <div className="proof-diff-grid single">
          <div className="proof-diff-cell review"><small>审阅台正文</small><p><del>{item.reviewText}</del></p></div>
          <div className="proof-diff-cell proof"><small>期刊校样</small><p className="proof-empty">（校样已删除本段）</p></div>
        </div>
      ) : item.status === 'added' ? (
        <div className="proof-diff-grid single">
          <div className="proof-diff-cell review"><small>审阅台正文</small><p className="proof-empty">（原文无此段）</p></div>
          <div className="proof-diff-cell proof"><small>期刊校样</small><p>{item.proofText}</p></div>
        </div>
      ) : item.status === 'split' ? (
        <div className="proof-diff-grid single">
          <div className="proof-diff-cell review"><small>审阅台正文（1 段）</small><p>{item.reviewText}</p></div>
          <div className="proof-diff-cell proof"><small>期刊校样（拆为 {item.proofTexts?.length} 段）</small>{item.proofTexts?.map((text, index) => <p key={index}>{index + 1}. {text}</p>)}</div>
        </div>
      ) : (
        <div className="proof-diff-grid">
          <div className="proof-diff-cell review"><small>审阅台正文</small><DiffText reviewText={item.reviewText} proofText={item.proofText} mode="review" /></div>
          <div className="proof-diff-cell proof"><small>期刊校样</small><DiffText reviewText={item.reviewText} proofText={item.proofText} mode="proof" /></div>
        </div>
      )}
      <ItemActions item={item} recordId={recordId} />
    </div>
  )
}

export default function ProofModal() {
  const open = useReviewStore((state) => state.proofModalOpen)
  const setProofModalOpen = useReviewStore((state) => state.setProofModalOpen)
  const proofs = useReviewStore((state) => state.proofs)
  const importProof = useReviewStore((state) => state.importProof)
  const [activeRecordId, setActiveRecordId] = useState<string>()
  const [showMatched, setShowMatched] = useState(false)
  const [importing, setImporting] = useState(false)

  const activeRecord = proofs.find((entry) => entry.id === activeRecordId) ?? proofs[0]

  useEffect(() => {
    if (open && proofs.length === 0) void handleImport()
    if (open && !activeRecordId && proofs[0]) setActiveRecordId(proofs[0].id)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = async () => {
    setImporting(true)
    const result = await importProof()
    setImporting(false)
    if (result.duplicated) message.info('同一份校样已导入，未重复建立段落')
    else if (result.ok) message.success('校样对账完成：已按段落比对审阅台正文')
    else message.error(`对账失败：${result.error ?? '未知错误'}；已守住审阅台正文，可重试`)
  }

  const sortedItems = useMemo(() => {
    if (!activeRecord) return []
    const order = new Map<string, number>()
    activeRecord.paragraphs.forEach((paragraph, index) => order.set(paragraph.id, index))
    return [...activeRecord.items].sort((a, b) => {
      const aOrder = a.reviewParagraphId ? order.get(a.proofParagraphIds[0]) ?? 999 : 999
      const bOrder = b.reviewParagraphId ? order.get(b.proofParagraphIds[0]) ?? 999 : 999
      return aOrder - bOrder
    })
  }, [activeRecord])

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const item of activeRecord?.items ?? []) result[item.status] = (result[item.status] ?? 0) + 1
    return result
  }, [activeRecord])

  const pendingCount = (activeRecord?.items ?? []).filter((item) => !item.resolved && item.status !== 'matched' && item.status !== 'use-proof' && item.status !== 'keep-review').length
  const actionItems = sortedItems.filter((item) => item.status !== 'matched')
  const matchedItems = sortedItems.filter((item) => item.status === 'matched')

  return (
    <Modal
      title={<span><ImportOutlined /> 期刊校样对账</span>}
      open={open}
      onCancel={() => setProofModalOpen(false)}
      footer={null}
      width={960}
    >
      {!proofs.length && !importing && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未导入校样">
          <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => void handleImport()}>拉取期刊校样</Button>
        </Empty>
      )}
      {importing && (
        <div className="proof-loading"><Spin tip="正在拉取校样并按段落对账…" size="large"><div className="proof-loading-placeholder" /></Spin></div>
      )}
      {activeRecord && !importing && (
        <>
          <div className="proof-record-bar">
            <div>
              <strong>{activeRecord.label}</strong>
              <Tag color={activeRecord.status === 'done' ? 'green' : activeRecord.status === 'failed' ? 'red' : 'gold'}>
                {activeRecord.status === 'done' ? '对账完成' : activeRecord.status === 'failed' ? '对账失败' : '对账中'}
              </Tag>
              <small>导入于 {new Date(activeRecord.importedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
            </div>
            <Space>
              {proofs.length > 1 && (
                <select value={activeRecord.id} onChange={(event) => setActiveRecordId(event.target.value)}>
                  {proofs.map((record) => <option key={record.id} value={record.id}>{record.label} · {new Date(record.importedAt).toLocaleDateString('zh-CN')}</option>)}
                </select>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => void handleImport()}>重新导入校样</Button>
            </Space>
          </div>

          {activeRecord.status === 'failed' && (
            <Alert
              className="proof-fail-alert"
              type="error"
              showIcon
              message="校样对账失败"
              description={<span>{activeRecord.error}。对账失败期间审阅台正文已守住，未替换任何段落；可重试拉取。</span>}
              action={<Button size="small" type="primary" icon={<ReloadOutlined />} onClick={() => void handleImport()}>重试对账</Button>}
            />
          )}

          {activeRecord.status === 'done' && (
            <>
              <div className="proof-summary">
                <Tag>一致 {counts.matched ?? 0}</Tag>
                <Tag color="green">排版改动 {counts['use-proof'] ?? 0}</Tag>
                <Tag color="blue">保留审阅台 {counts['keep-review'] ?? 0}</Tag>
                <Tag color="orange">两版待选 {counts.conflict ?? 0}</Tag>
                <Tag color="gold">待编辑处理 {pendingCount}</Tag>
              </div>
              {structuralStatuses.some((status) => counts[status]) && (
                <Alert
                  className="proof-structural-hint"
                  type="warning"
                  showIcon
                  message="排版对段落做了结构性调整"
                  description="校样将段落拆分或整段删除时不自动应用，已挂起等待编辑确认，避免作者的修订与意见丢失。"
                />
              )}
              <div className="proof-item-list">
                {actionItems.map((item) => <ProofItemCard key={item.id} item={item} recordId={activeRecord.id} />)}
                {matchedItems.length > 0 && (
                  <div className="proof-matched-toggle">
                    <Button type="link" size="small" onClick={() => setShowMatched((value) => !value)}>
                      {showMatched ? '收起' : '展开'} {matchedItems.length} 段与校样一致
                    </Button>
                    {showMatched && matchedItems.map((item) => <ProofItemCard key={item.id} item={item} recordId={activeRecord.id} />)}
                  </div>
                )}
                {!actionItems.length && !matchedItems.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可显示的对账条目" />}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
