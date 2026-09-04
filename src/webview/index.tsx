import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {NotionRenderer} from 'react-notion-x'
import type {CommandId} from '../constants'
import type {NotionWebviewState} from '../notion-webview-panel-serializer'
import type {OpenPageCommandArgs} from '../open-page-command'
import type {WebviewMessage} from '../webview-messages'
import {BasicEditor, type BasicEditorStatus} from './basic-editor'

import {Code} from 'react-notion-x/build/third-party/code'
import {Collection} from 'react-notion-x/build/third-party/collection'
import {Equation} from 'react-notion-x/build/third-party/equation'
import {Modal} from 'react-notion-x/build/third-party/modal'
import {Pdf} from 'react-notion-x/build/third-party/pdf'

const openPageCommand: `${CommandId.OpenPage}` = 'notion.openPage'

type VsCodeApi = {
  getState: () => NotionWebviewState
  setState: (state: NotionWebviewState) => void
  postMessage: (message: unknown) => void
}

declare global {
  interface Window {
    vscode: VsCodeApi
  }
}

function App() {
  const initialState = window.vscode.getState()
  const [state, setState] = useState(initialState)
  const [status, setStatus] = useState<{state: BasicEditorStatus; message?: string}>({state: 'idle'})
  const [resetDrafts, setResetDrafts] = useState(0)

  useEffect(() => {
    const onMessage = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data
      if (message.type === 'state' && state.source === 'official') {
        setState({id: state.id, title: message.state.title, source: 'official', data: message.state})
        if (message.resetDrafts) setResetDrafts((count) => count + 1)
      } else if (message.type === 'save_status') {
        setStatus({state: message.status, ...(message.message ? {message: message.message} : {})})
      } else if (message.type === 'error') {
        setStatus({state: 'error', message: message.message})
      } else if (message.type === 'conflict') {
        setStatus({state: 'conflict', message: message.message})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state.source, state.id])

  if (state.source === 'official') {
    return <BasicEditor document={state.data} postMessage={(message) => window.vscode.postMessage(message)} status={status} resetDrafts={resetDrafts} />
  }

  return <PublicPage state={state} />
}

function PublicPage({state}: {state: Extract<NotionWebviewState, {source: 'public'}>}) {
  return (
    <NotionRenderer
      fullPage
      recordMap={state.data.data}
      components={{
        Code,
        Collection,
        Equation,
        Modal,
        Pdf,
        PageLink: ({href, children, ...props}: {href: string; children: React.ReactElement}) => {
          const args = JSON.stringify({id: href.slice(1)} as OpenPageCommandArgs)
          return (
            <a {...props} href={`command:${openPageCommand}?${encodeURI(args)}`}>
              {children}
            </a>
          )
        },
      }}
    />
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
