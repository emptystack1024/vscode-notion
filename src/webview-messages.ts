import type {NotionDocument, EditableBlockType} from './notion-document'

export type HostMessage =
  | {
      type: 'update_block'
      blockId: string
      text: string
    }
  | {
      type: 'toggle_block'
      blockId: string
      checked: boolean
    }
  | {
      type: 'append_block'
      parentId: string
      afterBlockId?: string
      blockType: EditableBlockType
      text?: string
    }
  | {
      type: 'archive_block'
      blockId: string
    }
  | {
      type: 'refresh'
    }

export type WebviewMessage =
  | {
      type: 'state'
      state: NotionDocument
    }
  | {
      type: 'save_status'
      status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
      message?: string
    }
  | {
      type: 'error'
      message: string
      blockId?: string
    }
  | {
      type: 'conflict'
      message: string
      blockId?: string
    }

const editableBlockTypes: ReadonlySet<string> = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
])

export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined

  switch (value.type) {
    case 'update_block':
      return isString(value.blockId) && typeof value.text === 'string'
        ? {type: 'update_block', blockId: value.blockId, text: value.text}
        : undefined
    case 'toggle_block':
      return isString(value.blockId) && typeof value.checked === 'boolean'
        ? {type: 'toggle_block', blockId: value.blockId, checked: value.checked}
        : undefined
    case 'append_block': {
      const parentId = value.parentId
      const blockType = value.blockType
      const text = value.text
      const afterBlockId = value.afterBlockId
      if (!isString(parentId) ||
        !isEditableBlockType(blockType) ||
        (text !== undefined && typeof text !== 'string') ||
        (afterBlockId !== undefined && !isString(afterBlockId))) return undefined
      const validAfterBlockId: string | undefined = afterBlockId === undefined ? undefined : isString(afterBlockId) ? afterBlockId : undefined
      const validText: string | undefined = text === undefined ? undefined : typeof text === 'string' ? text : undefined
      return {
        type: 'append_block',
        parentId,
        blockType,
        ...(validText === undefined ? {} : {text: validText}),
        ...(validAfterBlockId === undefined ? {} : {afterBlockId: validAfterBlockId}),
      }
    }
    case 'archive_block':
      return isString(value.blockId)
        ? {type: 'archive_block', blockId: value.blockId}
        : undefined
    case 'refresh':
      return Object.keys(value).length === 1 ? {type: 'refresh'} : undefined
    default:
      return undefined
  }
}

type IncomingRecord = {
  type?: unknown
  blockId?: unknown
  text?: unknown
  checked?: unknown
  parentId?: unknown
  blockType?: unknown
  afterBlockId?: unknown
}

function isRecord(value: unknown): value is IncomingRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isEditableBlockType(value: unknown): value is EditableBlockType {
  return typeof value === 'string' && editableBlockTypes.has(value)
}
