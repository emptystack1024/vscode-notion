import type {RichTextItemRequest} from '@notionhq/client/build/src/api-endpoints/common'
import type {BlockObjectResponse, PageObjectResponse, RichTextItemResponse} from '@notionhq/client'
import {
  type EditableBlockType,
  type NotionBlock,
  type NotionDocument,
  plainTextToRichText,
  richTextToPlainText,
} from './notion-document'

const editableTypes = new Set<EditableBlockType>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
])

export function adaptOfficialPage(page: PageObjectResponse, blocks: BlockObjectResponse[]): NotionDocument {
  const pageId = page.id
  const blockById = new Map<string, NotionBlock>()
  const parentById = new Map<string, string | undefined>()

  for (const block of blocks) {
    const adapted = adaptBlock(block)
    blockById.set(adapted.id, adapted)
    parentById.set(adapted.id, getParentId(block))
  }

  const rootBlocks: NotionBlock[] = []
  for (const block of blocks) {
    const adapted = blockById.get(block.id)
    if (!adapted) continue

    const parentId = parentById.get(block.id)
    const parent = parentId ? blockById.get(parentId) : undefined
    if (parent) {
      parent.children.push(adapted)
    } else {
      rootBlocks.push(adapted)
    }
  }

  return {
    source: 'official',
    pageId,
    title: getPageTitle(page),
    lastEditedTime: page.last_edited_time,
    blocks: rootBlocks,
  }
}

export function adaptBlock(block: BlockObjectResponse): NotionBlock {
  const type = block.type
  const editable = editableTypes.has(type as EditableBlockType)
  const richText = getRichText(block)
  const text = richTextToPlainText(richText)
  const result: NotionBlock = {
    id: block.id,
    type: editable ? (type as EditableBlockType) : 'unsupported',
    text,
    richText: editable ? richTextToRequest(richText) : plainTextToRichText(text),
    lastEditedTime: block.last_edited_time,
    readOnly: !editable,
    children: [],
  }

  if (type === 'to_do') result.checked = block.to_do.checked
  if (!editable) result.unsupportedType = type
  return result
}

function getPageTitle(page: PageObjectResponse) {
  for (const property of Object.values(page.properties)) {
    if (property.type === 'title') return richTextToPlainText(property.title)
  }
  return ''
}

function getParentId(block: BlockObjectResponse) {
  if (block.parent.type === 'block_id') return block.parent.block_id
  if (block.parent.type === 'page_id') return block.parent.page_id
  return undefined
}

function getRichText(block: BlockObjectResponse): RichTextItemResponse[] {
  switch (block.type) {
    case 'paragraph':
      return block.paragraph.rich_text
    case 'heading_1':
      return block.heading_1.rich_text
    case 'heading_2':
      return block.heading_2.rich_text
    case 'heading_3':
      return block.heading_3.rich_text
    case 'heading_4':
      return block.heading_4.rich_text
    case 'bulleted_list_item':
      return block.bulleted_list_item.rich_text
    case 'numbered_list_item':
      return block.numbered_list_item.rich_text
    case 'to_do':
      return block.to_do.rich_text
    case 'quote':
      return block.quote.rich_text
    case 'toggle':
      return block.toggle.rich_text
    case 'callout':
      return block.callout.rich_text
    case 'template':
      return block.template.rich_text
    case 'code':
      return block.code.rich_text
    default:
      return []
  }
}

function richTextToRequest(richText: RichTextItemResponse[]): RichTextItemRequest[] {
  return richText.map((item): RichTextItemRequest => {
    const annotations = item.annotations
    const common = {
      annotations: {
        bold: annotations.bold,
        italic: annotations.italic,
        strikethrough: annotations.strikethrough,
        underline: annotations.underline,
        code: annotations.code,
        color: annotations.color,
      },
    }

    switch (item.type) {
      case 'text':
        return {
          ...common,
          type: 'text',
          text: {
            content: item.text.content,
            link: item.text.link,
          },
        }
      case 'equation':
        return {
          ...common,
          type: 'equation',
          equation: {expression: item.equation.expression},
        }
      case 'mention':
        switch (item.mention.type) {
          case 'user':
            return {...common, type: 'mention', mention: {type: 'user', user: {id: item.mention.user.id}}}
          case 'date':
            return {...common, type: 'mention', mention: {type: 'date', date: item.mention.date}}
          case 'page':
            return {...common, type: 'mention', mention: {type: 'page', page: {id: item.mention.page.id}}}
          case 'database':
            return {...common, type: 'mention', mention: {type: 'database', database: {id: item.mention.database.id}}}
          default:
            return {
              ...common,
              type: 'text',
              text: {content: item.plain_text, link: item.href ? {url: item.href} : null},
            }
        }
    }
  })
}
