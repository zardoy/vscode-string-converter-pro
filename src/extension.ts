import * as vscode from 'vscode'
import { expandPosition } from '@zardoy/vscode-utils/build/position'
import { Settings, getExtensionContributionsPrefix, getExtensionSetting } from 'vscode-framework'

const getSettings = (document: vscode.TextDocument) => {
    const config = vscode.workspace.getConfiguration(getExtensionContributionsPrefix().slice(0, -1), document)
    return (id => config.get(id)) as typeof getExtensionSetting
}

export const activate = () => {
    type TextChange = [number, string]
    type ConvertAction = null | TextChange[]
    let prevDollarsResult = null as { actions: ConvertAction[]; offset: number } | null

    vscode.workspace.onDidChangeTextDocument(async ({ document, contentChanges }) => {
        const editor = vscode.window.activeTextEditor
        if (!editor || document !== editor?.document || !contentChanges.length) return
        contentChanges = contentChanges.toSorted((a, b) => document.offsetAt(a.range.start) - document.offsetAt(b.range.start))

        if (prevDollarsResult) {
            const { actions, offset: prevOffset } = prevDollarsResult
            if (
                contentChanges.every(contentChange => contentChange.text === '{}') &&
                contentChanges.length === actions.length &&
                prevOffset === document.offsetAt(contentChanges[0]!.range.start) - 1
            ) {
                const edits: vscode.TextEdit[] = []
                let multicursorOffset = 0
                for (const [i, contentChange] of contentChanges.entries()) {
                    const subActions = actions[i]
                    if (!subActions) continue
                    const changeOffset = document.offsetAt(contentChange.range.start)
                    const getPos = (offset: number) => {
                        if (offset + 2 > changeOffset) offset += 2
                        offset += multicursorOffset
                        return document.positionAt(offset)
                    }
                    for (const [offset, replaceString] of subActions) {
                        edits.push(vscode.TextEdit.replace(expandPosition(document, getPos(offset), 1), replaceString))
                    }
                    multicursorOffset += 2
                }
                const edit = new vscode.WorkspaceEdit()
                edit.set(document.uri, edits)
                await vscode.workspace.applyEdit(edit)
            }
            prevDollarsResult = null
            return
        }
        if (contentChanges.every(contentChange => contentChange.text === '$')) {
            const getSetting = getSettings(document)
            if (!getSetting('enable')) return
            const actions = [] as ConvertAction[]
            for (const contentChange of contentChanges) {
                let path
                try {
                    path = (await vscode.commands.executeCommand<any>('tsEssentialPlugins.getNodePath', { position: contentChange.range.start })) ?? []
                } catch {}
                let addActions: ConvertAction = null
                if (path?.length) {
                    const { kindName, start, end } = path.at(-1)
                    if (kindName === 'StringLiteral') {
                        const replaceChar: [string, string] = path.at(-2)?.kindName === 'JsxAttribute' ? ['{`', '`}'] : ['`', '`']
                        addActions = [
                            [start, replaceChar[0]],
                            [end - 1, replaceChar[1]],
                        ]
                        if (getSetting('escapeExisting')) {
                            const textWithin = document.getText(new vscode.Range(document.positionAt(start), document.positionAt(end - 1)))
                            const offset = document.offsetAt(contentChange.range.start)
                            textWithin.replaceAll(/(?<!\\)\$\{/g, (str, index) => {
                                if (start + index !== offset) {
                                    addActions!.push([start + index, '\\$'])
                                }
                                return ''
                            })
                        }
                    }
                }
                actions.push(addActions)
            }
            prevDollarsResult = {
                actions,
                offset: document.offsetAt(contentChanges[0]!.range.start),
            }
        }
    })
}
