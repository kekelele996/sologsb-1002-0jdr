import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined, ArrowRightOutlined, BranchesOutlined, CheckOutlined, CloseOutlined,
  CommentOutlined, DiffOutlined, DeleteOutlined, FileDoneOutlined, FileProtectOutlined, FileTextOutlined,
  HistoryOutlined, ImportOutlined, LockOutlined, MenuFoldOutlined, MessageOutlined, PlusOutlined,
  RedoOutlined, SaveOutlined, SendOutlined, SwapOutlined, UndoOutlined, UnlockOutlined, UserSwitchOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Card, Checkbox, Divider, Empty, Input, Modal, Radio, Segmented, Select, Space, Tag, Tooltip, message } from 'antd'
import { submitRemotePatch } from './services/mockApi'
import { useReviewStore } from './store/review'
import type { Comment, CommentType, Paragraph, ReconcileDecision, ReconcileEntry, Role } from './types'

const roleMeta: Record<Role, { label: string; description: string; color: string }> = {
  author: { label: '作者工作区', description: '编辑正文，逐条接受或拒绝修改建议', color: '#2f6f5e' },
  reviewer: { label: '审稿人工作区', description: '引用原文、添加批注与修改建议并参与讨论', color: '#9a5b25' },
  editor: { label: '编辑工作区', description: '合并重复意见、锁定已确认段落并比较版本', color: '#5b4d8e' },
}
const roleIcon = (role: Role) => role === 'author' ? <FileDoneOutlined /> : role === 'reviewer' ? <CommentOutlined /> : <BranchesOutlined />
const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

const decisionMeta: Record<ReconcileDecision, { label: string; color: string }> = {
  same: { label: '双方一致', color: 'default' },
  'proof-only': { label: '排版改动 · 已套用校样', color: 'blue' },
  'local-only': { label: '作者修订 · 已留审阅台', color: 'green' },
  both: { label: '双方改动 · 待作者裁定', color: 'purple' },
  split: { label: '排版拆段 · 挂起', color: 'orange' },
  removed: { label: '排版删段 · 挂起', color: 'red' },
}

const ComparePair = ({ leftLabel, leftText, rightLabel, rightText, leftAction, rightAction }: {
  leftLabel: string
  leftText: string
  rightLabel: string
  rightText: string
  leftAction?: React.ReactNode
  rightAction?: React.ReactNode
}) => (
  <div className="revision-grid proof-compare">
    <div><small>{leftLabel}</small><p>{leftText}</p>{leftAction}</div>
    <div><small>{rightLabel}</small><p>{rightText}</p>{rightAction}</div>
  </div>
)

export default function App() {
  const {
    role, paragraphs, comments, versions, selectedParagraphId, commentFilter, revisionMode, dirty, conflicts,
    proofs, reconcileEntries, proofImporting,
    setRole, selectParagraph, setCommentFilter, setRevisionMode, updateParagraph, addComment, replyComment,
    resolveSuggestion, mergeComment, toggleLock, createVersion, addConflict, resolveConflict, dismissConflict,
    importProof, resolveReconcileEntry, resolveSplit, resolveRemoved, swapParagraphVariant,
    undo, redo, save, resetDemo,
  } = useReviewStore()
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentType, setCommentType] = useState<CommentType>('comment')
  const [commentBody, setCommentBody] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [quote, setQuote] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [versionOpen, setVersionOpen] = useState(false)
  const [versionA, setVersionA] = useState(versions[1]?.id ?? versions[0]?.id)
  const [versionB, setVersionB] = useState(versions[0]?.id)
  const [versionLabel, setVersionLabel] = useState('')
  const [proofOpen, setProofOpen] = useState(false)

  const selected = paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? paragraphs[0]
  const sections = useMemo(() => Array.from(new Set(paragraphs.map((paragraph) => paragraph.section))), [paragraphs])
  const paragraphCommentCounts = useMemo(() => comments.reduce<Record<string, number>>((acc, comment) => {
    acc[comment.paragraphId] = (acc[comment.paragraphId] ?? 0) + 1
    return acc
  }, {}), [comments])
  const duplicateParagraphIds = useMemo(() => new Set(Object.entries(paragraphCommentCounts).filter(([, count]) => count > 1).map(([id]) => id)), [paragraphCommentCounts])
  const visibleComments = useMemo(() => comments.filter((comment) => {
    if (commentFilter === 'open') return comment.status === 'open'
    if (commentFilter === 'suggestion') return comment.type === 'suggestion' && comment.status === 'open'
    if (commentFilter === 'duplicate') return duplicateParagraphIds.has(comment.paragraphId) && comment.status === 'open'
    return true
  }).sort((a, b) => b.createdAt - a.createdAt), [commentFilter, comments, duplicateParagraphIds])

  const latestProof = proofs[0]
  const proofEntries = useMemo(() => reconcileEntries.filter((entry) => entry.proofId === latestProof?.id), [reconcileEntries, latestProof])
  const pendingProofCount = reconcileEntries.filter((entry) => entry.status !== 'resolved').length
  const entryByParagraph = useMemo(() => {
    const map = new Map<string, ReconcileEntry>()
    reconcileEntries.forEach((entry) => { if (!map.has(entry.paragraphId)) map.set(entry.paragraphId, entry) })
    return map
  }, [reconcileEntries])
  const proofBaselineLabel = versions.find((version) => version.id === latestProof?.baselineVersionId)?.label

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      const state = useReviewStore.getState()
      const index = state.paragraphs.findIndex((paragraph) => paragraph.id === state.selectedParagraphId)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); state.redo()
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault(); const next = state.paragraphs[Math.min(state.paragraphs.length - 1, index + 1)]; if (next) state.selectParagraph(next.id)
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault(); const previous = state.paragraphs[Math.max(0, index - 1)]; if (previous) state.selectParagraph(previous.id)
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault(); state.setRevisionMode(!state.revisionMode)
      } else if (event.key.toLowerCase() === 'l' && state.role === 'editor') {
        event.preventDefault(); state.toggleLock(state.selectedParagraphId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const scrollToParagraph = (id: string) => {
    selectParagraph(id)
    document.getElementById(`paragraph-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const openComposer = (type: CommentType) => {
    const selectedText = window.getSelection()?.toString().trim()
    setQuote(selectedText && selected?.text.includes(selectedText) ? selectedText : selected?.text.slice(0, 64) ?? '')
    setSuggestion(type === 'suggestion' ? selected?.text ?? '' : '')
    setCommentType(type)
    setComposerOpen(true)
  }
  const submitComment = () => {
    if (!selected || !commentBody.trim()) { message.warning('请填写批注内容'); return }
    addComment({ paragraphId: selected.id, type: commentType, quote, body: commentBody.trim(), suggestion: commentType === 'suggestion' ? suggestion : undefined })
    setCommentBody(''); setSuggestion(''); setQuote(''); setComposerOpen(false)
    message.success(commentType === 'suggestion' ? '修改建议已提交' : '段落批注已添加')
  }
  const handleMockConflict = async () => {
    if (!selected) return
    const response = await submitRemotePatch(selected)
    addConflict({
      id: `conflict-${Date.now()}`, paragraphId: selected.id, localText: selected.text, remoteText: response.remoteText,
      localAuthor: roleMeta[role].label, remoteAuthor: response.remoteAuthor, detectedAt: Date.now(),
    })
    message.warning('模拟接口返回了同段落的远端修改，请处理冲突')
  }
  const handleCreateVersion = () => {
    if (versionLabel.trim()) createVersion(versionLabel.trim())
    else createVersion('')
    setVersionLabel('')
    message.success('当前版本已保存')
  }
  const handleImportProof = async () => {
    const result = await importProof()
    if (result === 'duplicate') message.info('同一份校样已导入过，未重复对账建段')
    else if (result === 'ok') message.success('校样已按段落完成对账')
    else message.error('校样对账失败，已守住审阅台正文，可重试')
    setProofOpen(true)
  }
  const pickProofSide = (entryId: string, choice: 'proof' | 'review') => {
    resolveReconcileEntry(entryId, choice)
    message.success(choice === 'proof' ? '已采用校样写法，审阅台版本收在段落里可换回' : '已保留审阅台版本，校样写法收在段落里可换回')
  }
  const handleSplit = (entryId: string, accept: boolean) => {
    resolveSplit(entryId, accept)
    message.success(accept ? '已按校样拆分段落，批注与回复保留在原段' : '已保留原段落，未拆分')
  }
  const handleRemoved = (entryId: string, confirm: boolean) => {
    resolveRemoved(entryId, confirm)
    message.success(confirm ? '已按校样删除该段，其意见与回复仍保留' : '已保留该段落')
  }
  const handleSwapVariant = (paragraphId: string, variantId: string) => {
    swapParagraphVariant(paragraphId, variantId)
    message.success('已换用该版本，前一版收在段落里可再换回')
  }
  const comparedA = versions.find((version) => version.id === versionA)
  const comparedB = versions.find((version) => version.id === versionB)
  const comparedRows = comparedA && comparedB ? comparedA.paragraphs.map((paragraph, index) => ({ a: paragraph, b: comparedB.paragraphs[index] })) : []

  return (
    <div className="review-app">
      <header className="app-header">
        <div className="paper-identity">
          <div className="paper-mark">CR</div>
          <div><h1>学术论文协作审阅台</h1><p>Collaborative Research Review · MS-2026-0417</p></div>
        </div>
        <div className="role-switch">
          <Segmented block value={role} onChange={(value) => setRole(value as Role)} options={(Object.keys(roleMeta) as Role[]).map((item) => ({ label: <span>{roleIcon(item)} {roleMeta[item].label.replace('工作区', '')}</span>, value: item }))} />
        </div>
        <Space>
          <Badge dot={dirty}><Button icon={<SaveOutlined />} onClick={() => { save(); message.success('草稿已保存到浏览器') }}>保存</Button></Badge>
          <Button icon={<UndoOutlined />} disabled={!useReviewStore.getState().past.length} onClick={undo} />
          <Button icon={<RedoOutlined />} disabled={!useReviewStore.getState().future.length} onClick={redo} />
          <Button icon={<ImportOutlined />} loading={proofImporting} onClick={() => void handleImportProof()}>导入校样</Button>
          <Badge count={pendingProofCount} size="small"><Button icon={<FileProtectOutlined />} onClick={() => setProofOpen(true)}>对账单</Button></Badge>
          <Button danger={conflicts.length > 0} icon={<SwapOutlined />} onClick={() => void handleMockConflict()}>模拟冲突</Button>
        </Space>
      </header>

      <div className="role-banner" style={{ '--role-color': roleMeta[role].color } as React.CSSProperties}>
        <span className="role-badge">{roleIcon(role)} {roleMeta[role].label}</span>
        <span>{roleMeta[role].description}</span>
        <span className="paper-state"><FileTextOutlined /> 论文正文 v2.4</span>
      </div>

      {conflicts.length > 0 && (
        <div className="conflict-stack">
          {conflicts.map((conflict) => (
            <Alert
              key={conflict.id} type="error" showIcon message={`段落冲突：${conflict.localAuthor} 与 ${conflict.remoteAuthor} 同时修改`}
              description={(
                <div className="conflict-content">
                  <div><b>本页版本</b><p>{conflict.localText}</p></div>
                  <div><b>模拟远端版本</b><p>{conflict.remoteText}</p></div>
                  <Space><Button size="small" onClick={() => resolveConflict(conflict.id, 'local')}>保留本页</Button><Button size="small" type="primary" onClick={() => resolveConflict(conflict.id, 'remote')}>采用远端</Button><Button size="small" type="text" onClick={() => dismissConflict(conflict.id)}>稍后处理</Button></Space>
                </div>
              )}
            />
          ))}
        </div>
      )}

      <main className="workspace">
        <aside className="toc-panel">
          <div className="panel-title"><MenuFoldOutlined /> 侧边目录</div>
          <nav>
            {sections.map((section) => (
              <div key={section} className="toc-section">
                <strong>{section}</strong>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <button key={paragraph.id} className={paragraph.id === selected?.id ? 'active' : ''} onClick={() => scrollToParagraph(paragraph.id)}>
                    <span>{paragraph.number}</span>
                    <span>{paragraph.text.slice(0, 24)}…</span>
                    {paragraph.status === 'locked' && <LockOutlined />}
                    {!!paragraphCommentCounts[paragraph.id] && <Badge count={paragraphCommentCounts[paragraph.id]} size="small" />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="version-box">
            <div className="panel-title"><HistoryOutlined /> 版本</div>
            <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="新版本名称" onPressEnter={handleCreateVersion} />
            <Button block icon={<PlusOutlined />} onClick={handleCreateVersion}>保存当前版本</Button>
            <Button block icon={<DiffOutlined />} onClick={() => setVersionOpen(true)}>比较两个版本</Button>
          </div>
        </aside>

        <section className="document-panel">
          <div className="document-toolbar">
            <div><h2>大语言模型辅助下的开源维护协作研究</h2><p>作者：林晓、陈默、王远 · 最近保存 {formatDate(Date.now())}</p></div>
            <Space>
              <Checkbox checked={revisionMode} onChange={(event) => setRevisionMode(event.target.checked)}>修订模式</Checkbox>
              <Tag color={dirty ? 'gold' : 'green'}>{dirty ? '有未保存修改' : '已保存'}</Tag>
            </Space>
          </div>

          <div className="paper-sheet">
            <div className="paper-kicker">RESEARCH ARTICLE · CONFIDENTIAL REVIEW</div>
            {sections.map((section) => (
              <section key={section} className="paper-section">
                <h3>{section}</h3>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => {
                  const proofEntry = entryByParagraph.get(paragraph.id)
                  return (
                  <article
                    id={`paragraph-${paragraph.id}`} key={paragraph.id} onMouseUp={() => setQuote(window.getSelection()?.toString().trim() ?? '')}
                    className={`paragraph-card ${paragraph.id === selected?.id ? 'selected' : ''} ${paragraph.highlighted ? 'highlighted' : ''} ${paragraph.status === 'locked' ? 'locked' : ''}`}
                    onClick={() => selectParagraph(paragraph.id)}
                  >
                    <div className="paragraph-meta">
                      <span className="paragraph-no">{paragraph.number}</span>
                      <span>段落 {paragraph.number.replace('.', '')}</span>
                      {paragraph.status === 'locked' && <Tag icon={<LockOutlined />} color="purple">已锁定</Tag>}
                      {paragraph.status === 'accepted' && <Tag icon={<CheckOutlined />} color="green">已确认</Tag>}
                      {!!paragraphCommentCounts[paragraph.id] && <Tag icon={<MessageOutlined />}>{paragraphCommentCounts[paragraph.id]} 条意见</Tag>}
                      {proofEntry?.decision === 'proof-only' && <Tag color="blue">已套用校样文字</Tag>}
                      {proofEntry?.decision === 'local-only' && <Tag color="green">校样未含此修订</Tag>}
                      {proofEntry?.decision === 'both' && proofEntry.status === 'pending' && <Tag color="purple">校样冲突待裁定</Tag>}
                      {proofEntry?.status === 'suspended' && <Tag color="orange">{proofEntry.decision === 'split' ? '排版拆段挂起' : '排版删段挂起'}</Tag>}
                    </div>
                    {revisionMode ? (
                      <div className="revision-grid">
                        <div><small>原稿</small><p>{paragraph.original}</p></div>
                        <div><small>当前修订</small><p>{paragraph.text}</p></div>
                      </div>
                    ) : role === 'author' ? (
                      <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={paragraph.text} readOnly={paragraph.status === 'locked'} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
                    ) : (
                      <p className="paragraph-text">{paragraph.text}</p>
                    )}
                    {proofEntry?.decision === 'both' && proofEntry.status === 'pending' && (
                      <ComparePair
                        leftLabel="审阅台版本 · 当前" leftText={paragraph.text}
                        rightLabel="校样写法" rightText={proofEntry.proofText}
                        leftAction={role === 'author' ? <Button size="small" onClick={(event) => { event.stopPropagation(); pickProofSide(proofEntry.id, 'review') }}>保留此版</Button> : undefined}
                        rightAction={role === 'author' ? <Button size="small" type="primary" onClick={(event) => { event.stopPropagation(); pickProofSide(proofEntry.id, 'proof') }}>采用此版</Button> : undefined}
                      />
                    )}
                    {proofEntry?.status === 'suspended' && (
                      <Alert
                        className="suspended-alert" type="warning" showIcon
                        message={proofEntry.decision === 'split' ? `排版将本段拆为 ${proofEntry.proofParts?.length ?? 2} 段，已挂起，正文暂未改动` : '排版在校样中整段删除本段，已挂起，正文暂未改动'}
                        description={role === 'editor' ? (
                          <Space>
                            {proofEntry.decision === 'split' ? (
                              <>
                                <Button size="small" type="primary" onClick={(event) => { event.stopPropagation(); handleSplit(proofEntry.id, true) }}>接受拆分</Button>
                                <Button size="small" onClick={(event) => { event.stopPropagation(); handleSplit(proofEntry.id, false) }}>保持原段</Button>
                              </>
                            ) : (
                              <>
                                <Button size="small" danger onClick={(event) => { event.stopPropagation(); handleRemoved(proofEntry.id, true) }}>确认删除</Button>
                                <Button size="small" onClick={(event) => { event.stopPropagation(); handleRemoved(proofEntry.id, false) }}>保留段落</Button>
                              </>
                            )}
                          </Space>
                        ) : '等编辑在对账单中处理'}
                      />
                    )}
                    {!!paragraph.variants.length && (
                      <div className="variant-list">
                        {paragraph.variants.map((variant) => (
                          <div key={variant.id} className="variant-item">
                            <small><Tag color={variant.source === 'proof' ? 'geekblue' : 'cyan'}>{variant.source === 'proof' ? '校样' : '审阅台'}</Tag>{variant.note}</small>
                            <p>{variant.text}</p>
                            {(role === 'author' || role === 'editor') && (
                              <Button size="small" type="link" icon={<SwapOutlined />} onClick={(event) => { event.stopPropagation(); handleSwapVariant(paragraph.id, variant.id) }}>换用此版</Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="paragraph-actions">
                      {role === 'reviewer' && <><Button size="small" icon={<CommentOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('comment') }}>添加批注</Button><Button size="small" icon={<FileDoneOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('suggestion') }}>提出建议</Button></>}
                      {role === 'editor' && <Button size="small" icon={paragraph.status === 'locked' ? <UnlockOutlined /> : <LockOutlined />} onClick={(event) => { event.stopPropagation(); toggleLock(paragraph.id) }}>{paragraph.status === 'locked' ? '解除锁定' : '锁定段落'}</Button>}
                      {role === 'author' && <span className="author-tip">可直接修改正文，右侧逐条处理建议</span>}
                    </div>
                  </article>
                  )
                })}
              </section>
            ))}
          </div>
        </section>

        <aside className="comments-panel">
          <div className="comments-header">
            <div><h2><CommentOutlined /> 审阅意见 <Badge count={comments.filter((comment) => comment.status === 'open').length} /></h2><p>引用原文、讨论与修订建议</p></div>
          </div>
          <div className="comment-filters">
            <Radio.Group value={commentFilter} onChange={(event) => setCommentFilter(event.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="all">全部</Radio.Button><Radio.Button value="open">待处理</Radio.Button><Radio.Button value="suggestion">建议</Radio.Button><Radio.Button value="duplicate">重复</Radio.Button>
            </Radio.Group>
          </div>
          <div className="comment-list">
            {visibleComments.map((comment) => {
              const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
              return (
                <Card key={comment.id} size="small" className={`comment-card ${comment.status}`} title={<span>{comment.author} <Tag>{comment.type === 'suggestion' ? '修改建议' : '段落批注'}</Tag></span>} extra={<small>{formatDate(comment.createdAt)}</small>}>
                  <button className="quote-line" onClick={() => paragraph && scrollToParagraph(paragraph.id)}>“{comment.quote}” · {paragraph ? `段落 ${paragraph.number}` : '段落已删除'}</button>
                  <p className="comment-body">{comment.body}</p>
                  {comment.suggestion && <div className="suggestion-box"><small>建议改为</small><p>{comment.suggestion}</p></div>}
                  {comment.status !== 'open' && <Tag color={comment.status === 'accepted' ? 'green' : comment.status === 'rejected' ? 'red' : 'blue'}>{comment.status === 'accepted' ? '已接受' : comment.status === 'rejected' ? '已拒绝' : '已合并'}</Tag>}
                  <div className="replies">
                    {comment.replies.map((reply) => <div key={reply.id} className="reply"><b>{reply.author}</b><span>{reply.body}</span></div>)}
                  </div>
                  <div className="reply-box">
                    <Input size="small" value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: event.target.value }))} placeholder="回复讨论…" onPressEnter={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                  </div>
                  {comment.status === 'open' && role === 'author' && comment.type === 'suggestion' && <div className="decision-row"><Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => resolveSuggestion(comment.id, true)}>接受修改</Button><Button danger size="small" icon={<CloseOutlined />} onClick={() => resolveSuggestion(comment.id, false)}>拒绝</Button></div>}
                  {comment.status === 'open' && role === 'editor' && duplicateParagraphIds.has(comment.paragraphId) && (() => {
                    const sibling = comments.find((item) => item.id !== comment.id && item.paragraphId === comment.paragraphId && item.status === 'open')
                    return sibling ? <Button size="small" type="dashed" icon={<BranchesOutlined />} onClick={() => mergeComment(comment.id, sibling.id)}>合并到“{sibling.author}”意见</Button> : null
                  })()}
                </Card>
              )
            })}
            {!visibleComments.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有意见" />}
          </div>
          <div className="keyboard-hint"><span><kbd>J</kbd>/<kbd>K</kbd> 段落导航</span><span><kbd>T</kbd> 修订模式</span>{role === 'editor' && <span><kbd>L</kbd> 锁定</span>}<span><kbd>⌘Z</kbd> 撤销</span></div>
        </aside>
      </main>

      <Modal title={commentType === 'suggestion' ? '提出修改建议' : '添加段落批注'} open={composerOpen} onCancel={() => setComposerOpen(false)} onOk={submitComment} okText="提交" width={620}>
        <div className="composer">
          <label>引用原文</label>
          <Input.TextArea value={quote} onChange={(event) => setQuote(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
          <label>{commentType === 'suggestion' ? '建议改为' : '批注内容'}</label>
          {commentType === 'suggestion' && <Input.TextArea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} />}
          <label>说明</label>
          <Input.TextArea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="说明修改理由或希望作者关注的问题" autoSize={{ minRows: 2, maxRows: 5 }} />
        </div>
      </Modal>

      <Modal title="版本比较" open={versionOpen} onCancel={() => setVersionOpen(false)} footer={null} width={980}>
        <div className="compare-selectors">
          <Select value={versionA} onChange={setVersionA} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
          <ArrowRightOutlined />
          <Select value={versionB} onChange={setVersionB} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
        </div>
        <div className="version-table">
          <div className="version-head"><b>{comparedA?.label ?? '版本 A'}</b><b>{comparedB?.label ?? '版本 B'}</b></div>
          {comparedRows.map(({ a, b }) => (
            <div key={a.id} className={`version-row ${a.text !== b?.text ? 'changed' : ''}`}>
              <div><span>{a.number}</span>{a.text}</div><div><span>{b?.number ?? '—'}</span>{b?.text ?? '段落已删除'}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title="校样对账单" open={proofOpen} onCancel={() => setProofOpen(false)} footer={null} width={920}>
        {!latestProof && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未导入校样。点击顶部「导入校样」，校样会按段落与审阅台正文对账，不会整段覆盖。" />}
        {latestProof?.status === 'failed' && (
          <Alert
            type="error" showIcon message="校样对账失败"
            description={`${latestProof.error ?? '校样服务异常'}。已守住审阅台这一版，正文、修订与意见均未受影响，可重试。`}
            action={<Button size="small" loading={proofImporting} onClick={() => void handleImportProof()}>重试</Button>}
          />
        )}
        {latestProof?.status === 'ok' && (
          <>
            <div className="proof-summary">
              <b>{latestProof.label}</b>
              <span>送排基线：{proofBaselineLabel ?? '未找到'}</span>
              <span>导入：{formatDate(latestProof.importedAt)}</span>
              <Space size={4} wrap>
                <Tag color="blue">排版改动 {proofEntries.filter((entry) => entry.decision === 'proof-only').length}</Tag>
                <Tag color="green">作者修订 {proofEntries.filter((entry) => entry.decision === 'local-only').length}</Tag>
                <Tag color="purple">待裁定 {proofEntries.filter((entry) => entry.status === 'pending').length}</Tag>
                <Tag color="orange">挂起 {proofEntries.filter((entry) => entry.status === 'suspended').length}</Tag>
                <Tag>一致 {proofEntries.filter((entry) => entry.decision === 'same').length}</Tag>
              </Space>
            </div>
            <div className="proof-entry-list">
              {proofEntries.map((entry) => {
                const paragraph = paragraphs.find((item) => item.id === entry.paragraphId)
                const meta = decisionMeta[entry.decision]
                return (
                  <div key={entry.id} className={`proof-entry ${entry.status}`}>
                    <div className="proof-entry-head">
                      <b>段落 {paragraph?.number ?? '（已删除）'}</b>
                      <Tag color={meta.color}>{meta.label}</Tag>
                      {entry.status === 'resolved' && entry.resolvedWith && <Tag>{entry.resolvedWith === 'proof' ? '采用校样' : '保留审阅台'}</Tag>}
                      {entry.status === 'pending' && <Tag color="warning">待作者裁定</Tag>}
                      {entry.status === 'suspended' && <Tag color="warning">挂起待编辑</Tag>}
                      {paragraph && <Button size="small" type="link" onClick={() => { setProofOpen(false); scrollToParagraph(paragraph.id) }}>定位</Button>}
                    </div>
                    {entry.note && <p className="proof-entry-note">{entry.note}</p>}
                    {entry.decision === 'proof-only' && (
                      <ComparePair leftLabel="审阅台原文字" leftText={entry.reviewText} rightLabel="校样文字 · 已套用" rightText={entry.proofText} />
                    )}
                    {entry.decision === 'local-only' && (
                      <ComparePair leftLabel="审阅台版本 · 已保留" leftText={entry.reviewText} rightLabel="校样写法 · 对照" rightText={entry.proofText} />
                    )}
                    {entry.decision === 'both' && (
                      <ComparePair
                        leftLabel={entry.status === 'resolved' && entry.resolvedWith === 'review' ? '审阅台版本 · 已选定' : '审阅台版本'}
                        leftText={entry.reviewText}
                        rightLabel={entry.status === 'resolved' && entry.resolvedWith === 'proof' ? '校样写法 · 已选定' : '校样写法'}
                        rightText={entry.proofText}
                        leftAction={entry.status === 'pending' && role === 'author' ? <Button size="small" onClick={() => pickProofSide(entry.id, 'review')}>保留此版</Button> : undefined}
                        rightAction={entry.status === 'pending' && role === 'author' ? <Button size="small" type="primary" onClick={() => pickProofSide(entry.id, 'proof')}>采用此版</Button> : undefined}
                      />
                    )}
                    {entry.decision === 'split' && (
                      <>
                        <ul className="split-parts">
                          {(entry.proofParts ?? []).map((part, index) => <li key={index}>分段 {index + 1}：{part}</li>)}
                        </ul>
                        {entry.status === 'suspended' && role === 'editor' && (
                          <Space>
                            <Button size="small" type="primary" onClick={() => handleSplit(entry.id, true)}>接受拆分</Button>
                            <Button size="small" onClick={() => handleSplit(entry.id, false)}>保持原段</Button>
                          </Space>
                        )}
                      </>
                    )}
                    {entry.decision === 'removed' && (
                      <>
                        <p className="proof-entry-text">{entry.reviewText}</p>
                        {entry.status === 'suspended' && role === 'editor' && (
                          <Space>
                            <Button size="small" danger onClick={() => handleRemoved(entry.id, true)}>确认删除</Button>
                            <Button size="small" onClick={() => handleRemoved(entry.id, false)}>保留段落</Button>
                          </Space>
                        )}
                        {entry.status === 'suspended' && role !== 'editor' && <p className="proof-entry-note">删除前会保留该段上的意见与回复，等编辑确认。</p>}
                      </>
                    )}
                    {entry.decision === 'same' && <p className="proof-entry-text">{entry.reviewText}</p>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Modal>

      <footer className="app-footer">
        <span>本地草稿自动持久化 · 模拟接口用于演示多人冲突处理与校样按段落对账</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => { resetDemo(); message.success('已重置示例数据') }}>重置示例</Button>
      </footer>
    </div>
  )
}
