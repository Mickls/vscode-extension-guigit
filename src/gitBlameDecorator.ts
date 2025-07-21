import * as vscode from "vscode";
import { GitBlameProvider, GitBlameLineInfo } from "./gitBlameProvider";

/**
 * Git Blame 装饰器，负责在编辑器中显示 blame 信息
 */
export class GitBlameDecorator {
  private blameProvider: GitBlameProvider;
  private decorationType: vscode.TextEditorDecorationType;
  private currentDecorations: vscode.DecorationOptions[] = [];
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖

  constructor(blameProvider: GitBlameProvider) {
    this.blameProvider = blameProvider;
    
    // 创建装饰器类型
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        fontWeight: 'normal'
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    this.initialize();
  }

  /**
   * 初始化事件监听器
   */
  private initialize() {
    // 监听光标位置变化
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(this.onSelectionChange, this)
    );

    // 监听活动编辑器变化
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange, this)
    );

    // 监听文档变化
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChange, this)
    );

    // 监听配置变化
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(this.onConfigurationChange, this)
    );

    // 初始显示当前编辑器的 blame 信息
    if (vscode.window.activeTextEditor) {
      this.updateBlameInfo(vscode.window.activeTextEditor);
    }
  }

  /**
   * 光标位置变化处理
   */
  private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (!this.isBlameEnabled()) {
      return;
    }

    this.debounceUpdateBlameInfo(event.textEditor);
  }

  /**
   * 活动编辑器变化处理
   */
  private onActiveEditorChange(editor: vscode.TextEditor | undefined) {
    if (!this.isBlameEnabled()) {
      return;
    }

    if (editor) {
      this.updateBlameInfo(editor);
    } else {
      this.clearDecorations();
    }
  }

  /**
   * 文档变化处理
   */
  private onDocumentChange(event: vscode.TextDocumentChangeEvent) {
    if (!this.isBlameEnabled()) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === event.document) {
      // 文档变化时清除缓存并重新获取 blame 信息
      this.blameProvider.clearCache();
      this.debounceUpdateBlameInfo(editor);
    }
  }

  /**
   * 配置变化处理
   */
  private onConfigurationChange(event: vscode.ConfigurationChangeEvent) {
    if (event.affectsConfiguration('guigit.blame')) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        if (this.isBlameEnabled()) {
          this.updateBlameInfo(editor);
        } else {
          this.clearDecorations();
        }
      }
    }
  }

  /**
   * 防抖更新 blame 信息
   */
  private debounceUpdateBlameInfo(editor: vscode.TextEditor) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.updateBlameInfo(editor);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 更新 blame 信息
   */
  private async updateBlameInfo(editor: vscode.TextEditor) {
    if (!this.isBlameEnabled() || !editor.document.fileName) {
      this.clearDecorations();
      return;
    }

    // 只处理文件 URI，不处理 untitled 等
    if (editor.document.uri.scheme !== 'file') {
      this.clearDecorations();
      return;
    }

    try {
      const currentLine = editor.selection.active.line;
      const blameInfo = await this.blameProvider.getBlameForLine(
        editor.document.fileName,
        currentLine
      );

      if (blameInfo && blameInfo.isCommitted && blameInfo.summary) {
        this.showBlameDecoration(editor, currentLine, blameInfo);
      } else {
        this.clearDecorations();
      }
    } catch (error) {
      console.error('Error updating blame info:', error);
      this.clearDecorations();
    }
  }

  /**
   * 显示 blame 装饰器
   */
  private showBlameDecoration(
    editor: vscode.TextEditor,
    lineNumber: number,
    blameInfo: GitBlameLineInfo
  ) {
    const line = editor.document.lineAt(lineNumber);
    const range = new vscode.Range(lineNumber, line.range.end.character, lineNumber, line.range.end.character);

    const decoration: vscode.DecorationOptions = {
      range: range,
      renderOptions: {
        after: {
          contentText: `  ${blameInfo.summary}`,
          color: new vscode.ThemeColor('editorCodeLens.foreground'),
          fontStyle: 'italic'
        }
      },
      hoverMessage: this.createHoverMessage(blameInfo)
    };

    this.currentDecorations = [decoration];
    editor.setDecorations(this.decorationType, this.currentDecorations);
  }

  /**
   * 创建悬停消息
   */
  private createHoverMessage(blameInfo: GitBlameLineInfo): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    if (blameInfo.hash && blameInfo.author && blameInfo.date && blameInfo.message) {
      const shortHash = blameInfo.hash.substring(0, 7);
      const fullDate = blameInfo.date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      markdown.appendMarkdown(`**提交信息:** ${blameInfo.message}\n\n`);
      markdown.appendMarkdown(`**作者:** ${blameInfo.author}\n\n`);
      markdown.appendMarkdown(`**提交时间:** ${fullDate} (${blameInfo.relativeTime})\n\n`);
      markdown.appendMarkdown(`**提交哈希:** \`${shortHash}\`\n\n`);
      
      // 添加命令链接
      const commandUri = vscode.Uri.parse(
        `command:guigit.showCommitDetails?${encodeURIComponent(JSON.stringify([blameInfo.hash]))}`
      );
      markdown.appendMarkdown(`[查看提交详情](${commandUri})`);
    }

    return markdown;
  }

  /**
   * 清除装饰器
   */
  private clearDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.decorationType, []);
    }
    this.currentDecorations = [];
  }

  /**
   * 检查是否启用了 blame 功能
   */
  private isBlameEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('guigit');
    return config.get('blame.enabled', true);
  }

  /**
   * 切换 blame 功能
   */
  public toggleBlame() {
    const config = vscode.workspace.getConfiguration('guigit');
    const currentEnabled = config.get('blame.enabled', true);
    config.update('blame.enabled', !currentEnabled, vscode.ConfigurationTarget.Global);
    
    if (!currentEnabled) {
      // 如果启用了，立即显示当前行的 blame 信息
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.updateBlameInfo(editor);
      }
    } else {
      // 如果禁用了，清除装饰器
      this.clearDecorations();
    }

    vscode.window.showInformationMessage(
      `Git Blame ${!currentEnabled ? '已启用' : '已禁用'}`
    );
  }

  /**
   * 销毁装饰器
   */
  public dispose() {
    this.clearDecorations();
    this.decorationType.dispose();
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }
}