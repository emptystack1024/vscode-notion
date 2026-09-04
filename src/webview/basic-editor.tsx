import React, {useEffect, useState} from 'react'
import {isEditableBlock, type EditableBlockType, type NotionBlock, type NotionDocument} from '../notion-document'
import type {HostMessage} from '../webview-messages'

export type BasicEditorStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export type BasicEditorProps = {
  document: NotionDocument
  postMessage: (message: HostMessage) => void
  status?: {
    state: BasicEditorStatus
    message?: string
  }
}

type TextValues = Record<string, string>

export function BasicEditor({document, postMessage, status}: BasicEditorProps) {
  const [textValues, setTextValues] = useState<TextValues>(() => getTextValues(document.blocks))

  useEffect(() => {
    setTextValues(getTextValues(document.blocks))
  }, [document])

  const updateText = (block: NotionBlock, text: string) => {
    setTextValues((current) => ({...current, [block.id]: text}))
  }

  const saveText = (block: NotionBlock) => {
    const text = textValues[block.id] ?? block.text
    if (text === block.text || block.readOnly) return
    postMessage({type: 'update_block', blockId: block.id, text})
  }

  return (
    <main className="notion-basic-editor">
      <header className="notion-basic-editor-header">
        <h1>{document.title || 'Untitled'}</h1>
        <StatusMessage status={status} />
      </header>
      <div className="notion-basic-editor-content">
        {document.blocks.map((block) => (
          <BlockEditor
            key={block.id}
            block={block}
            parentId={document.pageId}
            text={textValues[block.id] ?? block.text}
            textValues={textValues}
            onTextChange={updateText}
            onTextBlur={saveText}
            onToggle={(target, checked) => postMessage({type: 'toggle_block', blockId: target.id, checked})}
            onAppend={(parentId, afterBlockId, blockType) =>
              postMessage({type: 'append_block', parentId, afterBlockId, blockType})
            }
            onArchive={(target) => postMessage({type: 'archive_block', blockId: target.id})}
          />
        ))}
        <button
          className="notion-basic-editor-add"
          type="button"
          onClick={() => postMessage({type: 'append_block', parentId: document.pageId, blockType: 'paragraph'})}
        >
          Add paragraph
        </button>
      </div>
    </main>
  )
}

type BlockEditorProps = {
  block: NotionBlock
  parentId: string
  text: string
  textValues: TextValues
  onTextChange: (block: NotionBlock, text: string) => void
  onTextBlur: (block: NotionBlock) => void
  onToggle: (block: NotionBlock, checked: boolean) => void
  onAppend: (parentId: string, afterBlockId: string, blockType: EditableBlockType) => void
  onArchive: (block: NotionBlock) => void
}

function BlockEditor({
  block,
  parentId,
  text,
  textValues,
  onTextChange,
  onTextBlur,
  onToggle,
  onAppend,
  onArchive,
}: BlockEditorProps) {
  const editable = isEditableBlock(block)
  const childBlocks = block.children.map((child) => (
    <BlockEditor
      key={child.id}
      block={child}
      parentId={block.id}
      text={textValues[child.id] ?? child.text}
      textValues={textValues}
      onTextChange={onTextChange}
      onTextBlur={onTextBlur}
      onToggle={onToggle}
      onAppend={onAppend}
      onArchive={onArchive}
    />
  ))

  if (!editable) {
    return (
      <section className="notion-basic-editor-block notion-basic-editor-block-readonly">
        <div className="notion-basic-editor-readonly-label">
          {block.unsupportedType ? `Unsupported block: ${block.unsupportedType}` : 'Read-only block'}
        </div>
        {block.text && <div>{block.text}</div>}
        {childBlocks.length > 0 && <div className="notion-basic-editor-children">{childBlocks}</div>}
      </section>
    )
  }

  return (
    <section className={`notion-basic-editor-block notion-basic-editor-block-${block.type}`}>
      <div className="notion-basic-editor-block-row">
        {block.type === 'to_do' && (
          <input
            aria-label="Completed"
            type="checkbox"
            checked={block.checked ?? false}
            onChange={(event) => onToggle(block, event.target.checked)}
          />
        )}
        <EditableText block={block} text={text} onChange={onTextChange} onBlur={onTextBlur} />
        <div className="notion-basic-editor-actions">
          <button
            type="button"
            title="Add block below"
            aria-label="Add block below"
            onClick={() => onAppend(parentId, block.id, block.type)}
          >
            +
          </button>
          <button
            type="button"
            title="Delete block"
            aria-label="Delete block"
            onClick={() => onArchive(block)}
          >
            ×
          </button>
        </div>
      </div>
      {childBlocks.length > 0 && <div className="notion-basic-editor-children">{childBlocks}</div>}
    </section>
  )
}

type EditableTextProps = {
  block: NotionBlock
  text: string
  onChange: (block: NotionBlock, text: string) => void
  onBlur: (block: NotionBlock) => void
}

function EditableText({block, text, onChange, onBlur}: EditableTextProps) {
  if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
    return (
      <input
        className="notion-basic-editor-text notion-basic-editor-heading-input"
        aria-label={`${block.type} text`}
        value={text}
        onChange={(event) => onChange(block, event.target.value)}
        onBlur={() => onBlur(block)}
      />
    )
  }

  return (
    <textarea
      className="notion-basic-editor-text"
      aria-label={`${block.type} text`}
      rows={1}
      value={text}
      onChange={(event) => onChange(block, event.target.value)}
      onBlur={() => onBlur(block)}
    />
  )
}

function StatusMessage({status}: Pick<BasicEditorProps, 'status'>) {
  if (!status || status.state === 'idle') return null
  const message = status.message ??
    ({saving: 'Saving…', saved: 'Saved', error: 'Unable to save changes.', conflict: 'The page changed in Notion. Refresh before saving.'}[status.state])
  return (
    <div
      className={`notion-basic-editor-status notion-basic-editor-status-${status.state}`}
      role={status.state === 'saving' ? 'status' : 'alert'}
    >
      {message}
    </div>
  )
}

function getTextValues(blocks: NotionBlock[]): TextValues {
  const values: TextValues = {}
  for (const block of blocks) {
    values[block.id] = block.text
    Object.assign(values, getTextValues(block.children))
  }
  return values
}
