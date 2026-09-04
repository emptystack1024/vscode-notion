# VSCode Notion

Browse public Notion pages and read or edit shared private pages directly in Visual Studio Code.

## Public pages

Without an integration token, the extension opens pages shared for public access in a read-only Notion renderer. Public pages are never editable from the extension.

## Private pages

Private pages use the official Notion API. To enable them:

1. Create an [Internal Integration](https://www.notion.so/my-integrations) in Notion and copy its token.
2. Share each page you want to open with that integration. A token alone does not grant page access.
3. Run `Notion: Set Integration Token` from the VS Code Command Palette and enter the token.
4. Open the page using `Notion: Open Page` or the page URL/ID.

The token is validated with Notion and stored only in VS Code SecretStorage. It is not sent to the webview, written to the workspace, or included in the extension package. Use `Notion: Clear Integration Token` to remove it.

### Basic editing support

The private-page editor supports reading and basic editing of:

- Paragraphs
- Heading 1, Heading 2, and Heading 3
- Bulleted lists
- Numbered lists
- To-do blocks, including completion state

Editable text is saved when its input loses focus. Existing text links and annotations are preserved when the editor can safely map the change; blocks containing unsupported inline content such as mentions or equations are not written. Blocks can be added below an existing block or archived. Unsupported block types remain visible as read-only content. This is not a full Notion editor: rich-text formatting controls, databases, file uploads, drag-and-drop ordering, comments, and other advanced Notion features are outside the current scope.

If the page changes in Notion while it is open, the extension refuses to overwrite the newer version and reports a conflict. Refresh the page before trying again. A 403 usually means the integration has not been shared with the page; a 401 means the token is invalid; and a 404 means the page or block is unavailable to the integration.

This is an unofficial extension made using `react-notion-x` for public rendering and the official Notion API for authenticated pages.

<img align="center" src="https://raw.githubusercontent.com/kyswtn/vscode-notion/main/.github/demo.gif" />
