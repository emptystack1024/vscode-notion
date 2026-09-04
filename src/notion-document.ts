import type {RichTextItemRequest} from '@notionhq/client/build/src/api-endpoints/common'
import type {RichTextItemResponse} from '@notionhq/client'

export type EditableBlockType = 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do'

export type NotionDocument = {
  source: 'official'
  pageId: string
  title: string
  lastEditedTime: string
  blocks: NotionBlock[]
}

export type NotionBlock = {
  id: string
  type: EditableBlockType | 'unsupported'
  text: string
  richText: RichTextItemRequest[]
  checked?: boolean
  lastEditedTime: string
  readOnly: boolean
  unsupportedType?: string
  children: NotionBlock[]
}

export function isEditableBlock(block: NotionBlock): block is NotionBlock & {type: EditableBlockType} {
  return block.type !== 'unsupported' && !block.readOnly
}

export function richTextToPlainText(richText: RichTextItemResponse[]) {
  return richText.map((item) => item.plain_text).join('')
}

export function plainTextToRichText(content: string): RichTextItemRequest[] {
  if (!content) return []

  const characters = Array.from(content)
  const richText: RichTextItemRequest[] = []
  for (let offset = 0; offset < characters.length; offset += 2000) {
    richText.push({type: 'text', text: {content: characters.slice(offset, offset + 2000).join('')}})
  }
  return richText
}

export function getDocumentVersion(document: NotionDocument): string {
  return JSON.stringify({
    pageId: document.pageId,
    lastEditedTime: document.lastEditedTime,
    blocks: getBlockVersions(document.blocks),
  })
}

function getBlockVersions(blocks: NotionBlock[]): Array<{
  id: string
  type: NotionBlock['type']
  text: string
  richText: NotionBlock['richText']
  lastEditedTime: string
  checked?: boolean
  readOnly: boolean
  children: ReturnType<typeof getBlockVersions>
}> {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    text: block.text,
    richText: block.richText,
    lastEditedTime: block.lastEditedTime,
    ...(block.checked === undefined ? {} : {checked: block.checked}),
    readOnly: block.readOnly,
    children: getBlockVersions(block.children),
  }))
}
