import { App, Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import {
  compileWeChatMarkdown,
  generateBackgroundCss,
  validateCustomBlocks,
  type BlockSyntaxError,
} from './core/gzhCompiler';
import { resolveTheme } from './settings';
import { resolveImages, type ImageMode } from './imageAdapter';
import { getByPath, absolutizeUrl, appendQuery } from './core/imageHost';
import { DEFAULT_SETTINGS, type GzhFormatterSettings } from './settings';
import { GzhView, GZH_VIEW_TYPE } from './view';

export default class GzhFormatterPlugin extends Plugin {
  settings: GzhFormatterSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    // 主命令：读当前笔记 → 编译 → 写剪贴板
    this.addCommand({
      id: 'copy-to-wechat',
      name: '复制排版结果到公众号',
      callback: () => void this.copyToWeChat(),
    });

    // 带编辑器参数的命令：可以先在 Obsidian 里选中一段再排版
    this.addCommand({
      id: 'copy-selection-to-wechat',
      name: '仅复制选中内容到公众号',
      editorCallback: (editor: Editor) => void this.copySelectionToWeChat(editor),
    });

    // 侧栏预览：排版结果实时看
    this.registerView(GZH_VIEW_TYPE, (leaf) => new GzhView(leaf, this));

    this.addRibbonIcon('file-text', '公众号排版预览', () => {
      this.activateView();
    });

    this.addSettingTab(new GzhSettingTab(this.app, this));
  }

  onunload() {
    /* view 由 registerView 自行回收 */
  }

  activateView() {
    const existing = this.app.workspace.getLeavesOfType(GZH_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    void leaf.setViewState({ type: GZH_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // 预览面板依赖主题，主题变了要重绘
    this.app.workspace.updateOptions();
    this.app.workspace.trigger('gzh-formatter:refresh');
  }

  /** 取当前正在编辑的笔记 */
  private activeFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ?? null;
  }

  /**
   * 编译一篇笔记并写入剪贴板。
   *
   * 步骤顺序有讲究：
   *  1. 先查语法错误 —— 有错就停下告诉用户哪一行，别让他复制出一篇乱的
   *  2. 再处理图片 —— 必须在编译前，因为编译器会把 data URI 当普通 URL 输出
   *  3. 最后编译并写剪贴板
   */
  async copyToWeChat() {
    const file = this.activeFile();
    if (!file) {
      new Notice('请先打开一篇笔记');
      return;
    }

    const source = await this.app.vault.read(file);
    await this.processAndCopy(source, file.path, '已复制到公众号');
  }

  async copySelectionToWeChat(editor: Editor) {
    const selected = editor.getSelection();
    if (!selected.trim()) {
      new Notice('请先选中一段内容');
      return;
    }
    // 用当前笔记路径解析图片 —— 相对路径依赖它
    await this.processAndCopy(selected, this.activeFile()?.path ?? '', '已复制选中内容');
  }

  /** 供侧栏预览复用：只编译不复制 */
  async compile(markdown: string, sourcePath: string) {
    const theme = resolveTheme(this.settings.themeId);
    const withImages = await resolveImages(markdown, {
      app: this.app,
      sourcePath,
      mode: this.settings.imageMode,
      maxInlineBytes: this.settings.maxInlineKB * 1024,
      uploader: this.makeUploader(),
      onUploadError: (name, reason) => {
        // 上传失败不能静默 —— 用户需要知道哪些图没上外链
        const detail = this.lastUploadError || reason;
        new Notice(`「${name}」上传图床失败：${detail}。已回退为内嵌图片。`, 7000);
      },
    });
    const html = compileWeChatMarkdown(withImages.markdown, theme, {
      type: 'none',
      color: '',
      opacity: 0,
    } as never, {
      convertLinksToFootnotes: this.settings.convertLinksToFootnotes,
    });
    return { html, images: withImages };
  }

  private async processAndCopy(
    markdown: string,
    sourcePath: string,
    successMsg: string
  ) {
    // 1. 语法体检 —— 有错先拦下来
    const errors: BlockSyntaxError[] = validateCustomBlocks(markdown);
    if (errors.length > 0) {
      const first = errors[0];
      const reason =
        first.reason === 'unclosed' ? '缺少结尾 :::' : `块名 ${first.blockName} 不支持`;
      new Notice(`排版块有问题：第 ${first.line} 行 ${reason}。请先修正再复制。`, 8000);
      return;
    }

    const { html, images } = await this.compile(markdown, sourcePath);

    // 2. 提示被跳过的图片 —— 静默丢掉会让用户以为排版器坏了
    const warnings: string[] = [];
    if (images.missing.length) warnings.push(`${images.missing.length} 张图找不到`);
    if (images.oversized.length) warnings.push(`${images.oversized.length} 张图超限已跳过`);

    const ok = await this.writeClipboard(html, markdown);
    if (!ok) {
      new Notice('复制失败：剪贴板不可用，请检查系统权限', 6000);
      return;
    }

    new Notice(
      warnings.length
        ? `${successMsg}（${warnings.join('，')}）`
        : successMsg
    );
  }

  /**
   * 写剪贴板。
   *
   * 公众号编辑器认 `text/html` flavor，纯文本会被它当纯文本贴进去、样式全丢。
   * Obsidian 本身也是 Electron，窗口聚焦时 `navigator.clipboard` 可用；
   * 万一失败（系统权限/非聚焦）退回 execCommand。
   */
  private async writeClipboard(html: string, plainText: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
        return true;
      }
    } catch (e) {
      console.warn('clipboard API 失败，尝试降级:', e);
    }

    try {
      const box = document.createElement('div');
      box.innerHTML = html;
      box.style.position = 'fixed';
      box.style.left = '-9999px';
      document.body.appendChild(box);
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      const done = document.execCommand('copy');
      document.body.removeChild(box);
      sel?.removeAllRanges();
      return done;
    } catch (e) {
      console.error('剪贴板写入全部失败:', e);
      return false;
    }
  }

  /**
   * 图床上传。
   *
   * 刻意做成「用户自己填接口」而不是内置某家图床：内置就等于要内置密钥，
   * 而密钥一旦进仓库就是泄露。默认留空 —— 未配置时图片自动退回内嵌，不会丢。
   *
   * 复用桌面版的核心逻辑（core/imageHost 的纯函数），避免两套实现漂移：
   * 桌面版踩过的坑 —— 图床返回相对路径导致公众号裂图、数组响应结构取不到
   * 值 —— 这里不会再犯。
   */
  private makeUploader() {
    const endpoint = this.settings.uploadEndpoint.trim();
    if (!endpoint) return undefined;

        return async (file: TFile, data: ArrayBuffer): Promise<string | null> => {
      this.lastUploadError = '';
      try {
        const requestUrl = appendQuery(endpoint, this.settings.uploadQuery || '');
        const form = new FormData();
        form.append(
          this.settings.uploadField || 'file',
          new Blob([data], { type: file.extension ? `image/${file.extension}` : 'image/png' }),
          file.name
        );

        const res = await fetch(requestUrl, { method: 'POST', body: form });
        if (!res.ok) {
          this.lastUploadError = `服务器返回 ${res.status}`;
          return null;
        }

        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          this.lastUploadError = '响应不是 JSON';
          return null;
        }

        const raw =
          getByPath(json, this.settings.uploadResponsePath || 'url') ||
          getByPath(json, 'data.url') ||
          getByPath(json, 'url');
        if (!raw) {
          this.lastUploadError = `响应里找不到图片链接（路径：${this.settings.uploadResponsePath || 'url'}）`;
          return null;
        }

        // 相对路径补全 —— 公众号只认绝对地址
        const final = absolutizeUrl(raw, {
          domain: this.settings.uploadDomain,
          uploadUrl: endpoint,
        });
        if (!/^https?:\/\//i.test(final)) {
          this.lastUploadError = `返回的是相对路径「${raw}」，请在设置里填写「图片域名」`;
          return null;
        }
        return final;
      } catch (e: any) {
        this.lastUploadError = e?.message || String(e);
        console.warn('图床上传失败:', e);
        return null;
      }
    };
  }

  /** 取最近一次上传失败的原因（供 onUploadError 回调展示） */
  private lastUploadError = '';

  /** 背景 css 导出备用（后续如需导出整页 HTML 会用到） */
  backgroundCss() {
    return generateBackgroundCss;
  }
}

import { PluginSettingTab, Setting } from 'obsidian';
import { allThemes } from './settings';

/** 设置面板 */
class GzhSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: GzhFormatterPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('排版主题')
      .setDesc('决定字体、字号、配色与各元素的样式')
      .addDropdown((dd) => {
        for (const t of allThemes()) {
          dd.addOption(t.id, `${t.name} · ${t.englishName}`);
        }
        dd.setValue(this.plugin.settings.themeId);
        dd.onChange(async (v) => {
          this.plugin.settings.themeId = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('图片处理方式')
      .setDesc(
        '内嵌：图片转 base64 直接带上，公众号里一定能显示，但体积大。\n' +
          '图床：先上传换外链，体积小，但需要配置接口。'
      )
      .addDropdown((dd) => {
        dd.addOption('inline', '内嵌 base64（推荐）');
        dd.addOption('upload', '上传到图床');
        dd.setValue(this.plugin.settings.imageMode);
        dd.onChange(async (v) => {
          this.plugin.settings.imageMode = v as ImageMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('单图内嵌上限')
      .setDesc('超过这个体积的图片不会被内嵌，避免粘贴到公众号时被拒绝')
      .addSlider((s) => {
        s.setLimits(50, 2000, 50);
        s.setValue(this.plugin.settings.maxInlineKB);
        s.setDynamicTooltip();
        dd_label(s, this.plugin.settings.maxInlineKB);
        s.onChange(async (v) => {
          this.plugin.settings.maxInlineKB = v;
          dd_label(s, v);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('图床接口地址')
      .setDesc(
        'POST 接口，需返回包含图片链接的 JSON。留空则自动退回 base64 内嵌。\n' +
          '出于安全考虑插件不内置任何图床密钥，需要你自己实现或用第三方服务。'
      )
      .addText((t) => {
        t.setPlaceholder('https://your-server.com/upload')
          .setValue(this.plugin.settings.uploadEndpoint);
        t.onChange(async (v) => {
          this.plugin.settings.uploadEndpoint = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('图床文件字段名')
      .setDesc('上传时图片所在的表单字段名')
      .addText((t) => {
        t.setPlaceholder('file')
          .setValue(this.plugin.settings.uploadField);
        t.onChange(async (v) => {
          this.plugin.settings.uploadField = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('响应中图片链接的位置')
      .setDesc('支持 url、data.url、0.src（顶层数组第一项）等写法')
      .addText((t) => {
        t.setPlaceholder('url')
          .setValue(this.plugin.settings.uploadResponsePath);
        t.onChange(async (v) => {
          this.plugin.settings.uploadResponsePath = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('图片域名（可选）')
      .setDesc(
        '图床若只返回 /file/xxx.jpg 这类相对路径，会用它补全。\n' +
          '留空则自动取上传接口的域名 —— 公众号只认绝对地址。'
      )
      .addText((t) => {
        t.setPlaceholder('https://cdn.example.com')
          .setValue(this.plugin.settings.uploadDomain);
        t.onChange(async (v) => {
          this.plugin.settings.uploadDomain = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('附加查询参数（可选）')
      .setDesc('部分图床需加参数才返回完整链接，如 returnFormat=full。一般留空即可。')
      .addText((t) => {
        t.setPlaceholder('returnFormat=full')
          .setValue(this.plugin.settings.uploadQuery);
        t.onChange(async (v) => {
          this.plugin.settings.uploadQuery = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('链接转为脚注')
      .setDesc('正文里的外链自动收进文末脚注，公众号里阅读体验更好')
      .addToggle((t) => {
        t.setValue(this.plugin.settings.convertLinksToFootnotes);
        t.onChange(async (v) => {
          this.plugin.settings.convertLinksToFootnotes = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName('推广位').setHeading();

    new Setting(containerEl)
      .setName('文末追加推广信息')
      .setDesc('复制时在文末追加你的公众号引导语，留空则不追加')
      .addToggle((t) => {
        t.setValue(this.plugin.settings.appendPromo);
        t.onChange(async (v) => {
          this.plugin.settings.appendPromo = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('推广位内容')
      .setDesc('支持 Markdown，例如 **加粗**、> 引用。支持 [[当前笔记名]] 占位')
      .addTextArea((t) => {
        t.setValue(this.plugin.settings.promoText);
        t.setPlaceholder('关注「公众号名」，每周更新');
        t.onChange(async (v) => {
          this.plugin.settings.promoText = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('语法速查')
      .setDesc(':::hero / :::toc / :::callout 等排版块的写法')
      .addButton((b) =>
        b.setButtonText('打开笔记').onClick(async () => {
          await this.app.workspace.getLeaf(true).openFile(
            this.app.vault.getAbstractFileByPath(
              `${this.app.vault.configDir}/gzh-formatter/语法速查.md`
            ) as TFile
          );
        })
      );
  }
}

function dd_label(slider: { sliderEl: HTMLElement }, value: number) {
  slider.sliderEl.parentElement?.querySelector('.gzh-slider-label')?.remove();
  const span = document.createElement('span');
  span.className = 'gzh-slider-label';
  span.style.marginLeft = '10px';
  span.style.fontSize = '12px';
  span.style.opacity = '0.7';
  span.textContent = `${value} KB`;
  slider.sliderEl.after(span);
}
