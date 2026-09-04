import {Client, isHTTPResponseError, type BlockObjectResponse, type PageObjectResponse} from '@notionhq/client'
import type {RichTextItemRequest} from '@notionhq/client/build/src/api-endpoints/common'
import {Injectable} from 'vedk'
import {NotionAuth} from './notion-auth'

export type OfficialPageData = {
  page: PageObjectResponse
  blocks: BlockObjectResponse[]
}

export type EditableBlockType = 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do'

export type UpdateEditableBlock = {
  blockId: string
  type: EditableBlockType
  richText: RichTextItemRequest[]
  checked?: boolean
}

export type AppendEditableBlock = {
  type: EditableBlockType
  richText: RichTextItemRequest[]
  checked?: boolean
}

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'permission' | 'notFound' | 'rateLimit' | 'request',
  ) {
    super(message)
    this.name = 'NotionApiError'
  }
}

@Injectable()
export class NotionOfficialApi {
  constructor(private readonly auth: NotionAuth) {}

  async getPageData(pageId: string): Promise<OfficialPageData> {
    const client = await this.createClient()
    try {
      const page = await client.pages.retrieve({page_id: pageId})
      if (page.object !== 'page' || !('properties' in page)) {
        throw new NotionApiError('The Notion API returned an incomplete page.', 'request')
      }
      const blocks = await this.getChildren(client, pageId)
      return {page, blocks}
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  async updateBlock(input: UpdateEditableBlock) {
    const client = await this.createClient()
    try {
      await client.blocks.update({
        block_id: input.blockId,
        [input.type]: {
          rich_text: input.richText,
          ...(input.type === 'to_do' && input.checked !== undefined ? {checked: input.checked} : {}),
        },
      } as never)
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  async appendBlock(parentId: string, input: AppendEditableBlock, afterBlockId?: string) {
    const client = await this.createClient()
    try {
      await client.blocks.children.append({
        block_id: parentId,
        children: [
          {
            [input.type]: {
              rich_text: input.richText,
              ...(input.type === 'to_do' && input.checked !== undefined ? {checked: input.checked} : {}),
            },
          },
        ],
        ...(afterBlockId ? {after: afterBlockId} : {}),
      } as never)
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  async archiveBlock(blockId: string) {
    const client = await this.createClient()
    try {
      await client.blocks.update({block_id: blockId, in_trash: true})
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  async getPageLastEditedTime(pageId: string) {
    const client = await this.createClient()
    try {
      const page = await client.pages.retrieve({page_id: pageId})
      return 'last_edited_time' in page ? page.last_edited_time : undefined
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  async getBlockLastEditedTime(blockId: string) {
    const client = await this.createClient()
    try {
      const block = await client.blocks.retrieve({block_id: blockId})
      return 'last_edited_time' in block ? block.last_edited_time : undefined
    } catch (error) {
      throw normalizeNotionError(error)
    }
  }

  private async createClient() {
    const token = await this.auth.getToken()
    if (!token) throw new NotionApiError('A Notion integration token is not configured.', 'auth')
    return new Client({auth: token})
  }

  private async getChildren(client: Client, blockId: string): Promise<BlockObjectResponse[]> {
    const blocks: BlockObjectResponse[] = []
    let cursor: string | undefined
    do {
      const response = await client.blocks.children.list({block_id: blockId, ...(cursor ? {start_cursor: cursor} : {})})
      for (const block of response.results) {
        if (block.object !== 'block' || !('type' in block)) continue
        blocks.push(block)
        if (block.has_children) blocks.push(...(await this.getChildren(client, block.id)))
      }
      cursor = response.next_cursor ?? undefined
    } while (cursor)
    return blocks
  }
}

function normalizeNotionError(error: unknown): NotionApiError {
  if (error instanceof NotionApiError) return error
  if (isHTTPResponseError(error)) {
    if (error.status === 401) return new NotionApiError('The Notion integration token is invalid.', 'auth')
    if (error.status === 403) return new NotionApiError('The Notion integration cannot access this Notion page.', 'permission')
    if (error.status === 404) return new NotionApiError('The Notion page or block was not found.', 'notFound')
    if (error.status === 429) return new NotionApiError('Notion is rate limiting requests. Try again later.', 'rateLimit')
  }
  return new NotionApiError(error instanceof Error ? error.message : 'The Notion API request failed.', 'request')
}
