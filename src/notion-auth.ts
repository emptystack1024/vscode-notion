import {Client, isHTTPResponseError} from '@notionhq/client'
import {InjectContext, Injectable} from 'vedk'
import * as vscode from 'vscode'
import {CommandId} from './constants'

const tokenStorageKey = 'notion.integrationToken'

@Injectable()
export class NotionAuth implements vscode.Disposable {
  private readonly disposable: vscode.Disposable

  constructor(@InjectContext('secrets') private readonly secrets: vscode.SecretStorage) {
    this.disposable = vscode.Disposable.from(
      vscode.commands.registerCommand(CommandId.SetIntegrationToken, this.setToken, this),
      vscode.commands.registerCommand(CommandId.ClearIntegrationToken, this.clearToken, this),
    )
  }

  dispose() {
    this.disposable.dispose()
  }

  getToken() {
    return this.secrets.get(tokenStorageKey)
  }

  private async setToken() {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your Notion Internal Integration token.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : 'A Notion integration token is required.',
    })
    if (!token) return

    const normalizedToken = token.trim()
    try {
      await vscode.window.withProgress(
        {
          title: 'VSCode Notion',
          location: vscode.ProgressLocation.Notification,
        },
        async (progress) => {
          progress.report({message: 'Validating integration token...'})
          await new Client({auth: normalizedToken}).users.me({})
        },
      )
      await this.secrets.store(tokenStorageKey, normalizedToken)
      await vscode.window.showInformationMessage('Notion integration token saved.')
    } catch (error) {
      await vscode.window.showErrorMessage(formatAuthError(error))
    }
  }

  private async clearToken() {
    await this.secrets.delete(tokenStorageKey)
    await vscode.window.showInformationMessage('Notion integration token cleared.')
  }
}

function formatAuthError(error: unknown) {
  if (isHTTPResponseError(error)) {
    if (error.status === 401) return 'The Notion integration token is invalid.'
    if (error.status === 403) return 'The Notion integration token cannot access the Notion API.'
    return `Notion token validation failed (${error.status}).`
  }
  return error instanceof Error ? error.message : 'Notion token validation failed.'
}
