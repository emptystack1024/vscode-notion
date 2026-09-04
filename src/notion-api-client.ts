import {NotionAPI} from 'notion-client'
import {Injectable} from 'vedk'
import {adaptOfficialPage} from './notion-block-adapter'
import type {NotionDocument} from './notion-document'
import {NotionAuth} from './notion-auth'
import {NotionOfficialApi, NotionApiError} from './notion-official-api'

export type PublicPageData = {
  source: 'public'
  data: Awaited<ReturnType<NotionAPI['getPage']>>
}

export type OfficialPageDocument = {
  source: 'official'
  data: NotionDocument
}

export type NotionPageData = PublicPageData | OfficialPageDocument

@Injectable()
export class NotionApiClient {
  private readonly client = new NotionAPI()

  constructor(
    private readonly auth: NotionAuth,
    private readonly officialApi: NotionOfficialApi,
  ) {}

  async getPageDataById(id: string): Promise<NotionPageData> {
    if (await this.auth.getToken()) {
      try {
        const official = await this.officialApi.getPageData(id)
        return {source: 'official', data: adaptOfficialPage(official.page, official.blocks)}
      } catch (error) {
        if (!(error instanceof NotionApiError) || (error.kind !== 'permission' && error.kind !== 'notFound')) throw error
      }
    }

    return {source: 'public', data: await this.client.getPage(id)}
  }
}
