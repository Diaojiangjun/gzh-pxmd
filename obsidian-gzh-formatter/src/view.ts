import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import type GzhFormatterPlugin from './main';

export const GZH_VIEW_TYPE = 'gzh-formatter-preview';

/**
 * 侧栏排版预览。
 *
 * 定位是「排版结果的所见即所得检查台」—— 不是替代 Obsidian 自己的预览，
 * 而是让你在粘贴到公众号之前先确认一次效果：字号、配色、块级元素有没有跑偏。
 */
export class GzhView extends ItemView {
  private plugin: GzhFormatterPlugin;
  private debounceTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GzhFormatterPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return GZH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '公众号排版预览';
  }

  getIcon(): string {
    return 'file-text';
  }

  async onOpen() {
    this.render();

    // 切笔记 / 改内容时自动刷新，但要防抖 —— 打字过程中每键重编译会卡。
    // 注意 registerEvent 返回 void（它内部注册清理逻辑），所以不能拿它的返回值做判断。
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleRender()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleRender()));
    this.registerEvent(this.app.workspace.on('editor-change', () => this.scheduleRender()));
    this.registerEvent(
      // 主题切换 —— 自定义事件名，saveSettings 里触发
      this.app.workspace.on('gzh-formatter:refresh' as never, () => this.scheduleRender())
    );
  }

  private scheduleRender() {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.render();
    }, 400);
  }

  async onClose() {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
  }

  private async render() {
    const container = this.contentEl;
    container.empty();

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      container.createEl('p', {
        text: '打开一篇笔记后，这里会显示公众号里的排版效果。',
        cls: 'gzh-empty',
      });
      return;
    }

    const source = await this.app.vault.read(view.file);
    if (!source.trim()) {
      container.createEl('p', { text: '当前笔记是空的。', cls: 'gzh-empty' });
      return;
    }

    const bar = container.createDiv({ cls: 'gzh-bar' });
    bar.createSpan({ text: view.file.basename, cls: 'gzh-title' });

    const btn = bar.createEl('button', { text: '复制', cls: 'mod-cta' });
    btn.onclick = async () => {
      await this.plugin.copyToWeChat();
    };

    const status = container.createDiv({ cls: 'gzh-status' });
    const body = container.createDiv({ cls: 'gzh-body' });
    status.setText('正在排版…');

    try {
      const { html, images } = await this.plugin.compile(source, view.file.path);

      // 公众号是 375px 宽的阅读栏，预览按这个宽度给才准
      body.style.maxWidth = '375px';
      body.innerHTML = html;

      const notes: string[] = [];
      if (images.inlined) {
        notes.push(
          `内嵌 ${images.inlined} 张（${(images.inlineBytes / 1024).toFixed(0)}KB）`
        );
      }
      if (images.uploaded) notes.push(`图床 ${images.uploaded} 张`);
      if (images.missing.length) {
        notes.push(`⚠ 找不到 ${images.missing.length} 张：${images.missing.slice(0, 3).join('、')}`);
      }
      if (images.oversized.length) {
        notes.push(
          `⚠ ${images.oversized.length} 张超限未内嵌：${images.oversized.slice(0, 2).join('、')}`
        );
      }
      status.setText(notes.length ? notes.join(' · ') : '可以复制了');
      status.toggleClass('gzh-status-warn', images.missing.length > 0 || images.oversized.length > 0);

      if (images.missing.length || images.oversized.length) {
        new Notice(
          `有 ${images.missing.length + images.oversized.length} 张图片没进 HTML，详见预览面板提示`,
          5000
        );
      }
    } catch (e) {
      status.setText('排版失败');
      body.createEl('pre', { text: String(e) });
      console.error('排版失败:', e);
    }
  }
}
