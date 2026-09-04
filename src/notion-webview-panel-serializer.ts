import {nanoid} from 'nanoid'
import {getPageTitle} from 'notion-utils'
import {InjectContext, Injectable} from 'vedk'
import * as vscode from 'vscode'
import {CommandId, ConfigId, ViewType, configurationPrefix, trustedSources, untitledPageTitle} from './constants'
import {NotionApiClient, type PublicPageData} from './notion-api-client'
import {NotionOfficialApi, type EditableBlockType} from './notion-official-api'
import {adaptOfficialPage} from './notion-block-adapter'
import {plainTextToRichText, getDocumentVersion, type NotionBlock, type NotionDocument} from './notion-document'
import {parseHostMessage, type HostMessage, type WebviewMessage} from './webview-messages'
import {RecentsStateProvider} from './recents'

export type NotionWebviewState =
  | {
      id: string
      title: string
      source: 'public'
      data: PublicPageData
    }
  | {
      id: string
      title: string
      source: 'official'
      data: NotionDocument
    }

class CachedNotionWebview implements vscode.Disposable {
  private operation = Promise.resolve()
  private disposed = false

  constructor(
    public webviewPanel: vscode.WebviewPanel,
    public state: NotionWebviewState,
    private readonly extraDisposables: vscode.Disposable,
  ) {}

  dispose(disposePanel = true) {
    if (this.disposed) return
    this.disposed = true
    this.extraDisposables.dispose()
    if (disposePanel) this.webviewPanel.dispose()
  }

  enqueue(task: () => Promise<void>) {
    const next = this.operation.then(task, task)
    this.operation = next.then(() => undefined, () => undefined)
    return next
  }

  get isDisposed() {
    return this.disposed
  }

  reveal() {
    this.webviewPanel.reveal()
  }
}

@Injectable()
export class NotionWebviewPanelSerializer implements vscode.WebviewPanelSerializer, vscode.Disposable {
  private readonly cache = new Map<string, CachedNotionWebview>()
  private readonly disposable: vscode.Disposable

  constructor(
    @InjectContext() private readonly context: vscode.ExtensionContext,
    private readonly notionApi: NotionApiClient,
    private readonly notionOfficialApi: NotionOfficialApi,
    private readonly recentsState: RecentsStateProvider,
  ) {
    this.disposable = vscode.Disposable.from(
      vscode.commands.registerCommand(CommandId.RefreshPage, this.refreshActivePage, this),
      vscode.window.registerWebviewPanelSerializer(ViewType.NotionPageView, this),
      vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration(configurationPrefix)) await this.rerenderCachedWebviews()
      }),
    )
  }

  dispose() {
    this.disposable.dispose()
    for (const cache of this.cache.values()) cache.dispose()
    this.cache.clear()
  }

  async createOrShowPage(id: string) {
    const cached = this.cache.get(id)
    if (cached) {
      await this.recentsState.addRecent(id, cached.state.title)
      cached.reveal()
      return
    }

    const state = await this.fetchDataAndGetPageState(id)
    const webviewPanel = vscode.window.createWebviewPanel(
      ViewType.NotionPageView,
      state.title,
      {viewColumn: vscode.ViewColumn.Active},
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: [CommandId.OpenPage],
      },
    )

    await this.recentsState.addRecent(id, state.title)
    await this.deserializeWebviewPanel(webviewPanel, state)
  }

  async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state?: unknown) {
    const normalizedState = normalizeWebviewState(state)
    if (!normalizedState) return

    let notionPage!: CachedNotionWebview
    const panelDisposed = webviewPanel.onDidDispose(() => {
      const cached = this.cache.get(normalizedState.id)
      if (cached?.webviewPanel !== webviewPanel) return
      cached.dispose(false)
      this.cache.delete(normalizedState.id)
    }, this)
    const messages = webviewPanel.webview.onDidReceiveMessage((value: unknown) => {
      void notionPage.enqueue(() => this.handleMessage(notionPage, value))
    }, this)
    notionPage = new CachedNotionWebview(webviewPanel, normalizedState, vscode.Disposable.from(panelDisposed, messages))

    this.renderWebview(notionPage.webviewPanel, normalizedState)
    this.cache.set(normalizedState.id, notionPage)
  }

  private async refreshActivePage() {
    for (const cache of this.cache.values()) {
      if (!cache.webviewPanel.active) continue
      if (cache.isDisposed) return
      await cache.enqueue(() => this.reloadPage(cache))
      return
    }
  }

  private async rerenderCachedWebviews() {
    for (const cache of this.cache.values()) this.renderWebview(cache.webviewPanel, cache.state)
  }

  private async fetchDataAndGetPageState(id: string): Promise<NotionWebviewState> {
    const data = await vscode.window.withProgress(
      {
        title: 'VSCode Notion',
        location: vscode.ProgressLocation.Notification,
      },
      async (progress) => {
        progress.report({message: 'Loading...'})
        return this.notionApi.getPageDataById(id)
      },
    )

    if (data.source === 'official') {
      return {id, title: data.data.title || untitledPageTitle, source: 'official', data: data.data}
    }

    const title = getPageTitle(data.data) ?? untitledPageTitle
    return {id, title, source: 'public', data}
  }

  private async handleMessage(cache: CachedNotionWebview, value: unknown) {
    if (cache.isDisposed) return

    const message = parseHostMessage(value)
    if (!message) {
      await this.postMessage(cache, {type: 'error', message: 'Invalid edit request.'})
      return
    }
    if (message.type === 'refresh') {
      try {
        await this.reloadPage(cache)
      } catch (error) {
        await this.reportFailure(cache, error, 'Unable to refresh the page.')
      }
      return
    }
    if (cache.state.source !== 'official') {
      await this.postMessage(cache, {type: 'error', message: 'Editing is available only for pages opened with a Notion integration token.'})
      return
    }

    await this.postMessage(cache, {type: 'save_status', status: 'saving'})
    try {
      this.validateMessage(cache.state.data, message)
      await this.assertCurrentVersion(cache.state.id, cache.state.data)

      if (message.type === 'update_block') {
        const block = findBlock(cache.state.data.blocks, message.blockId)
        if (!block || !isEditableType(block.type)) throw new Error('The selected block cannot be edited.')
        await this.notionOfficialApi.updateBlock({
          blockId: block.id,
          type: block.type,
          richText: plainTextToRichText(message.text),
        })
      } else if (message.type === 'toggle_block') {
        const block = findBlock(cache.state.data.blocks, message.blockId)
        if (!block || block.type !== 'to_do') throw new Error('The selected block is not a to-do block.')
        await this.notionOfficialApi.updateBlock({
          blockId: block.id,
          type: 'to_do',
          richText: block.richText,
          checked: message.checked,
        })
      } else if (message.type === 'append_block') {
        await this.notionOfficialApi.appendBlock(
          message.parentId,
          {
            type: message.blockType,
            richText: plainTextToRichText(message.text ?? ''),
            ...(message.blockType === 'to_do' ? {checked: false} : {}),
          },
          message.afterBlockId,
        )
      } else if (message.type === 'archive_block') {
        await this.notionOfficialApi.archiveBlock(message.blockId)
      }

      await this.reloadPage(cache)
      await this.postMessage(cache, {type: 'save_status', status: 'saved'})
    } catch (error) {
      await this.reportFailure(cache, error)
    }
  }

  private async assertCurrentVersion(
    pageId: string,
    document: NotionDocument,
  ) {
    const current = await this.notionOfficialApi.getPageData(pageId)
    const currentDocument = adaptOfficialPage(current.page, current.blocks)
    if (getDocumentVersion(currentDocument) !== getDocumentVersion(document)) {
      throw new ConflictError('The page changed in Notion. Refresh before saving.')
    }
  }

  private async reportFailure(cache: CachedNotionWebview, error: unknown, fallbackMessage = 'Unable to save changes.') {
    const messageText = error instanceof Error ? error.message : fallbackMessage
    if (error instanceof ConflictError) {
      await this.postMessage(cache, {type: 'conflict', message: messageText})
      await this.postMessage(cache, {type: 'save_status', status: 'conflict', message: messageText})
    } else {
      await this.postMessage(cache, {type: 'error', message: messageText})
      await this.postMessage(cache, {type: 'save_status', status: 'error', message: messageText})
    }
  }

  private validateMessage(document: NotionDocument, message: Exclude<HostMessage, {type: 'refresh'}>) {
    if (message.type === 'append_block') {
      const parent = message.parentId === document.pageId ? undefined : findBlock(document.blocks, message.parentId)
      if (message.parentId !== document.pageId && !parent) throw new Error('The parent block is not part of this page.')
      if (parent?.readOnly) throw new Error('The parent block cannot contain editable children.')
      if (message.afterBlockId) {
        const siblings = parent?.children ?? document.blocks
        if (!siblings.some((block) => block.id === message.afterBlockId)) throw new Error('The insertion point is not part of this page.')
      }
      return
    }

    const block = findBlock(document.blocks, message.blockId)
    if (!block || !isEditableType(block.type)) throw new Error('The selected block cannot be edited.')
    if (message.type === 'toggle_block' && block.type !== 'to_do') throw new Error('The selected block is not a to-do block.')
  }

  private async reloadPage(cache: CachedNotionWebview) {
    const state = await this.fetchDataAndGetPageState(cache.state.id)
    cache.state = state
    this.renderWebview(cache.webviewPanel, state)
  }

  private async postMessage(cache: CachedNotionWebview, message: WebviewMessage) {
    if (cache.isDisposed) return
    await cache.webviewPanel.webview.postMessage(message)
  }

  private renderWebview(webviewPanel: vscode.WebviewPanel, state: NotionWebviewState) {
    const nonce = nanoid()
    const extensionUri = this.context.extensionUri
    const cspSource = webviewPanel.webview.cspSource

    const config = vscode.workspace.getConfiguration(configurationPrefix)
    const fontFamily = config.get<string>(ConfigId.FontFamily)
    const fontSize = config.get<number>(ConfigId.FontSize)
    const fontSettings = `--notion-font-family: ${fontFamily};--notion-font-size: ${fontSize}px;`.replace(/"/g, '&quot;')
    const frameSrcCsp = config.get<boolean>(ConfigId.AllowEmbeds) ? trustedSources.join(' ') : "'none'"
    const styleSheets = ['reset.css', 'vscode.css', 'notion.css', 'prism.css']
    const styleSheetUris = styleSheets.map((cssPath) =>
      webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources/css', cssPath)),
    )
    const reactWebviewUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist/webview.js'))

    webviewPanel.webview.html = `
<!DOCTYPE html>
<html lang="en" style="${fontSettings}">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="frame-src ${frameSrcCsp}; default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https:; script-src 'nonce-${nonce}';" />
    ${styleSheetUris.map((x) => `<link href="${x}" rel="stylesheet" />`).join('\n')}
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      vscode.setState(${serializeForScript(state)});
      window.vscode = vscode;
    </script>
    <script nonce="${nonce}" src="${reactWebviewUri}"></script>
</body>
</html>`
  }
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) =>
    ({'<': '\\u003c', '>': '\\u003e', '&': '\\u0026'}[character] ?? character),
  )
}

type StateRecord = {
  id?: unknown
  title?: unknown
  source?: unknown
  data?: unknown
  pageId?: unknown
  lastEditedTime?: unknown
  blocks?: unknown
  type?: unknown
  text?: unknown
  richText?: unknown
  checked?: unknown
  readOnly?: unknown
  children?: unknown
  unsupportedType?: unknown
}

function normalizeWebviewState(value: unknown): NotionWebviewState | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') return undefined
  if (value.source === 'official' && isNotionDocument(value.data)) {
    return {id: value.id, title: value.title, source: 'official', data: value.data}
  }
  if (value.source === 'public' && isRecord(value.data) && isRecord(value.data.data)) {
    return {id: value.id, title: value.title, source: 'public', data: value.data as PublicPageData}
  }
  if (value.source === undefined && isRecord(value.data)) {
    return {
      id: value.id,
      title: value.title,
      source: 'public',
      data: {source: 'public', data: value.data as PublicPageData['data']},
    }
  }
  return undefined
}

function isNotionDocument(value: unknown): value is NotionDocument {
  return isRecord(value) && value.source === 'official' && typeof value.pageId === 'string' &&
    typeof value.title === 'string' && typeof value.lastEditedTime === 'string' &&
    Array.isArray(value.blocks) && value.blocks.every(isNotionBlock)
}

function isNotionBlock(value: unknown): value is NotionBlock {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 ||
    typeof value.type !== 'string' ||
    (value.type !== 'unsupported' && !isEditableType(value.type as NotionBlock['type'])) ||
    typeof value.text !== 'string' || !Array.isArray(value.richText) ||
    typeof value.lastEditedTime !== 'string' || typeof value.readOnly !== 'boolean' ||
    !Array.isArray(value.children) || !value.children.every(isNotionBlock)) return false
  if (value.checked !== undefined && typeof value.checked !== 'boolean') return false
  return value.unsupportedType === undefined || typeof value.unsupportedType === 'string'
}

function isRecord(value: unknown): value is StateRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class ConflictError extends Error {}

function isEditableType(type: NotionBlock['type']): type is EditableBlockType {
  return type !== 'unsupported'
}

function findBlock(blocks: NotionBlock[], id: string): NotionBlock | undefined {
  for (const block of blocks) {
    if (block.id === id) return block
    const child = findBlock(block.children, id)
    if (child) return child
  }
  return undefined
}
