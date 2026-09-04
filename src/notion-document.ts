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

type TextRichTextItem = RichTextItemRequest & {
  type: 'text'
  text: {content: string; link?: {url: string} | null}
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

type TextCharacter = {
  character: string
  template: TextRichTextItem
}

export function updateRichText(
  richText: RichTextItemRequest[],
  content: string,
): RichTextItemRequest[] | undefined {
  if (richText.length === 0) return plainTextToRichText(content)

  const original: TextCharacter[] = []
  for (const item of richText) {
    if ((item as {type?: unknown}).type !== 'text') return undefined
    const textItem = item as TextRichTextItem
    for (const character of Array.from(textItem.text.content)) {
      original.push({character, template: textItem})
    }
  }

  const next = Array.from(content)
  let prefix = 0
  while (prefix < original.length && prefix < next.length && original[prefix]?.character === next[prefix]) prefix++

  let suffix = 0
  while (
    suffix < original.length - prefix &&
    suffix < next.length - prefix &&
    original[original.length - 1 - suffix]?.character === next[next.length - 1 - suffix]
  ) suffix++

  const characters: TextCharacter[] = original.slice(0, prefix)
  const template = original[prefix - 1]?.template ?? original[prefix]?.template
  for (const character of next.slice(prefix, next.length - suffix)) {
    if (template) characters.push({character, template})
    else characters.push({character, template: richText[0] as TextRichTextItem})
  }
  characters.push(...original.slice(original.length - suffix))

  const result: RichTextItemRequest[] = []
  for (const entry of characters) {
    const previous = result[result.length - 1]
    if (isTextRichTextItem(previous) && sameTextStyle(previous, entry.template)) {
      previous.text.content += entry.character
    } else {
      result.push({...entry.template, text: {...entry.template.text, content: entry.character}})
    }
  }
  return result
}

function isTextRichTextItem(value: RichTextItemRequest | undefined): value is TextRichTextItem {
  return value !== undefined && (value as {type?: unknown}).type === 'text'
}

function sameTextStyle(left: TextRichTextItem, right: TextRichTextItem) {
  return JSON.stringify({...left, text: {...left.text, content: ''}}) ===
    JSON.stringify({...right, text: {...right.text, content: ''}})
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
